import json
import math
import os
import random
import urllib.request
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[2]
CACHE_PATH = ROOT / "scripts" / "ml" / "cache" / "clean_bytecodes.json"
MODEL_OUT = ROOT / "assets" / "models" / "evm-bytecode-risk.onnx"

CLEAN_CONTRACTS: List[Tuple[int, str, str]] = [
    (1, "0x41675C099F32341bf84BFc5382af534df5C7461a", "Safe v1.4.1"),
    (1, "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", "SafeL2 v1.4.1"),
    (1, "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "ERC-4337 EntryPoint v0.6"),
    (1, "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "ERC-4337 EntryPoint v0.7"),
    (1, "0xcA11bde05977b3631167028862bE2a173976CA11", "Multicall3"),
    (1, "0x000000000022D473030F116dDEE9F6B43aC78BA3", "Uniswap Permit2"),
    (1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "Circle USDC (Mainnet)"),
    (1, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH9"),
    (1, "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", "Uniswap SwapRouter02"),
    (1, "0x1F98431c8aD98523631AE4a59f267346ea31F984", "Uniswap V3 Factory"),
    (1, "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", "Aave V3 Pool"),
    (1, "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", "ENS Registry"),
    (8453, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "Circle USDC (Base)"),
    (8453, "0x4200000000000000000000000000000000000006", "WETH (Base)"),
    (8453, "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b", "MetaMask EIP-7702 Delegator"),
    (8453, "0xd6CEDDe84be40893d153Be9d467CD6aD37875b28", "ZeroDev Kernel v3.1"),
    (8453, "0x000100abaad02f1cfC8Bbe32bD5a564817339E72", "Coinbase Smart Wallet"),
    (8453, "0x2626664c2603336E57B271c5C0b26F421741e481", "Uniswap SwapRouter02 (Base)"),
]

RPCS = {
    1: "https://ethereum-rpc.publicnode.com",
    8453: "https://base-rpc.publicnode.com",
}

DRAIN_SELECTORS = ["a9059cbb", "23b872dd", "095ea7b3", "a22cb465", "d505accf"]
SAFE_SELECTORS = ["b61d27f6", "47e1da2a", "ac9650d8", "3ccfd60b"]


def fetch_code(chain_id: int, address: str) -> str:
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "eth_getCode", "params": [address, "latest"]
    }).encode("utf-8")
    req = urllib.request.Request(
        RPCS[chain_id],
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "SovRoute-ML-Trainer/1.0"},
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("result", "0x")


def load_or_fetch_clean_bytecodes() -> List[Dict[str, str]]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    items = []
    for chain_id, addr, label in CLEAN_CONTRACTS:
        try:
            code = fetch_code(chain_id, addr)
            if code and len(code) > 10:
                items.append({"chainId": chain_id, "address": addr, "label": label, "bytecode": code})
                print(f"[FETCH] {label}: {(len(code)-2)//2} bytes")
        except Exception as exc:
            print(f"[WARN] Failed {label}: {exc}")
    CACHE_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")
    return items


def extract_features(hex_code: str) -> List[float]:
    """Must stay 100% identical to TypeScript extractEvmFeatures()."""
    clean = hex_code[2:].lower() if hex_code.startswith("0x") else hex_code.lower()
    byte_len = len(clean) // 2
    if byte_len == 0:
        return [0.0] * 32

    raw = bytes.fromhex(clean[: byte_len * 2])
    counts: Dict[str, int] = {
        "stop_ret_rev": 0, "call": 0, "delegatecall": 0, "callcode": 0,
        "selfdestruct": 0, "create": 0, "sstore": 0, "sload": 0,
        "mem": 0, "sha3": 0, "caller": 0, "origin": 0,
        "callvalue": 0, "balance": 0, "extcode": 0, "jump": 0,
        "log": 0, "push": 0,
    }
    unique_ops = set()
    push4_selectors = set()
    total_ops = 0

    pc = 0
    while pc < byte_len:
        op = raw[pc]
        total_ops += 1
        unique_ops.add(op)

        if op in (0x00, 0xf3, 0xfd):
            counts["stop_ret_rev"] += 1
        elif op in (0xf1, 0xfa):
            counts["call"] += 1
        elif op == 0xf4:
            counts["delegatecall"] += 1
        elif op == 0xf2:
            counts["callcode"] += 1
        elif op == 0xff:
            counts["selfdestruct"] += 1
        elif op in (0xf0, 0xf5):
            counts["create"] += 1
        elif op == 0x55:
            counts["sstore"] += 1
        elif op == 0x54:
            counts["sload"] += 1
        elif op in (0x51, 0x52, 0x53):
            counts["mem"] += 1
        elif op == 0x20:
            counts["sha3"] += 1
        elif op == 0x33:
            counts["caller"] += 1
        elif op == 0x32:
            counts["origin"] += 1
        elif op == 0x34:
            counts["callvalue"] += 1
        elif op in (0x31, 0x47):
            counts["balance"] += 1
        elif op in (0x3b, 0x3c, 0x3f):
            counts["extcode"] += 1
        elif op in (0x56, 0x57):
            counts["jump"] += 1
        elif 0xa0 <= op <= 0xa4:
            counts["log"] += 1

        if op == 0x63 and pc + 4 < byte_len:
            sel = raw[pc + 1 : pc + 5].hex()
            push4_selectors.add(sel)

        if 0x60 <= op <= 0x7f:
            counts["push"] += 1
            pc += (op - 0x5f)
        pc += 1

    denom = max(1, total_ops)
    drain_hits = [1.0 if s in push4_selectors else 0.0 for s in DRAIN_SELECTORS]
    safe_hits = [1.0 if s in push4_selectors else 0.0 for s in SAFE_SELECTORS]
    has_drain = 1.0 if sum(drain_hits) > 0 else 0.0
    zero_density = raw.count(0) / max(1, byte_len)

    return [
        math.log1p(byte_len) / 12.0,
        counts["stop_ret_rev"] / denom,
        counts["call"] / denom,
        min(1.0, counts["delegatecall"] / 5.0),
        min(1.0, counts["callcode"] / 3.0),
        1.0 if counts["selfdestruct"] > 0 else 0.0,
        min(1.0, counts["create"] / 3.0),
        counts["sstore"] / denom,
        counts["sload"] / denom,
        counts["mem"] / denom,
        counts["sha3"] / denom,
        counts["caller"] / denom,
        1.0 if counts["origin"] > 0 else 0.0,
        counts["callvalue"] / denom,
        counts["balance"] / denom,
        counts["extcode"] / denom,
        counts["jump"] / denom,
        counts["log"] / denom,
        counts["push"] / denom,
        len(unique_ops) / 256.0,
        *drain_hits,  # 5 features
        *safe_hits,   # 4 features
        1.0 if (counts["delegatecall"] > 0 and has_drain > 0) else 0.0,
        1.0 if (counts["origin"] > 0 and (counts["call"] > 0 or has_drain > 0)) else 0.0,
        zero_density,
    ]


def build_dataset(clean_items: List[Dict[str, str]]) -> Tuple[List[List[float]], List[float]]:
    rng = random.Random(42)
    X: List[List[float]] = []
    y: List[float] = []

    # 1. Real audited contracts + benign variants (e.g. PUSH32 containing 0xff/0xf4 data)
    for item in clean_items:
        X.append(extract_features(item["bytecode"]))
        y.append(0.0)
        # Augment slightly with benign PUSH32 metadata / constructor-like variations
        for _ in range(12):
            noise = "7f" + ("fff4f0f5" * 8) + "63b61d27f6"
            augmented = item["bytecode"] + noise * rng.randint(1, 3)
            X.append(extract_features(augmented))
            y.append(0.0)

    # Add minimal benign proxy / Safe-like stubs (DELEGATECALL + caller check, no drain selectors, no selfdestruct)
    for _ in range(80):
        pad = "".join(rng.choices(["6000", "51", "52", "33", "54", "55", "56", "5b", "f3", "fd"], k=rng.randint(10, 40)))
        stub = "0x60806040523363b61d27f6" + pad + "f400"
        X.append(extract_features(stub))
        y.append(0.0)

    # 2. Malicious / drainer / exploit bytecode patterns
    malicious_templates = [
        lambda: "0x6080604052" + "6323b872dd" + "63095ea7b3" + "f1" * rng.randint(1, 3) + "ff",
        lambda: "0x608060405232" + "63a9059cbb" + "63a22cb465" + "f1" + "00",
        lambda: "0x6080604052" + "63" + rng.choice(DRAIN_SELECTORS) + "f4" + "ff",
        lambda: "0x60806040523247f1ff",  # tx.origin + selfbalance + call + selfdestruct
        lambda: "0x6080604052" + "63d505accf" + "6323b872dd" + "f4" + "6000" * rng.randint(2, 10) + "f3",
        lambda: "0x6080604052" + "".join(rng.choices(["6000", "51", "52", "34", "47", "f1"], k=rng.randint(8, 25))) + "ff",
    ]
    for _ in range(300):
        fn = rng.choice(malicious_templates)
        noise = "".join(rng.choices(["6001", "5b", "50", "56", "57", "80", "90"], k=rng.randint(2, 15)))
        X.append(extract_features(fn() + noise))
        y.append(1.0)

    combined = list(zip(X, y))
    rng.shuffle(combined)
    X_shuf, y_shuf = zip(*combined)
    return list(X_shuf), list(y_shuf)


class EvmRiskMlp(nn.Module):
    def __init__(self, in_dim: int = 32):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def main():
    clean_items = load_or_fetch_clean_bytecodes()
    print(f"[DATA] Loaded {len(clean_items)} real on-chain audited contracts.")
    X, y = build_dataset(clean_items)
    split = int(len(X) * 0.8)

    X_train = torch.tensor(X[:split], dtype=torch.float32)
    y_train = torch.tensor(y[:split], dtype=torch.float32).unsqueeze(1)
    X_val = torch.tensor(X[split:], dtype=torch.float32)
    y_val = torch.tensor(y[split:], dtype=torch.float32).unsqueeze(1)

    model = EvmRiskMlp(32)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion = nn.BCEWithLogitsLoss()

    for epoch in range(1, 141):
        model.train()
        optimizer.zero_grad()
        logits = model(X_train)
        loss = criterion(logits, y_train)
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        val_probs = torch.sigmoid(model(X_val))
        preds = (val_probs >= 0.5).float()
        acc = (preds == y_val).float().mean().item()
        tp = ((preds == 1) & (y_val == 1)).sum().item()
        fp = ((preds == 1) & (y_val == 0)).sum().item()
        fn = ((preds == 0) & (y_val == 1)).sum().item()
        precision = tp / max(1, tp + fp)
        recall = tp / max(1, tp + fn)
        print(f"[VAL] Samples={len(X_val)} Acc={acc:.4f} Precision={precision:.4f} Recall={recall:.4f}")

    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.randn(1, 32, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        str(MODEL_OUT),
        input_names=["features"],
        output_names=["logits"],
        dynamic_axes={"features": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    print(f"[EXPORT] Saved ONNX model -> {MODEL_OUT} ({MODEL_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
