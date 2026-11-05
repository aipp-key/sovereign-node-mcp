async function main() {
  const auth = Buffer.from(":__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w").toString("base64");
  const res = await fetch("http://127.0.0.1:9740/payments/incoming?limit=100", {
    headers: { Authorization: "Basic " + auth }
  });
  const data = await res.json();
  const paid = data.filter(p => p.isPaid);
  console.log("=== PHOENIXD GELEN ODEME GECMISI (SON HAREKETLER) ===");
  console.log(`Toplam Tahsil Edilen Islem Sayisi: ${paid.length}`);
  for (const p of paid) {
    const d = new Date(p.completedAt).toISOString().replace("T", " ").substring(0, 19);
    console.log(`${d} UTC | +${p.receivedSat} sats | ${p.description || "Aciklama yok"}`);
  }
}
main();
