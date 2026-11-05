async function main() {
  const auth = Buffer.from(":__G3mE5-OJwzyIdNmMMxNQRnjqb-uK-w").toString("base64");
  
  // 1. Create 1 sat invoice
  const params = new URLSearchParams({ amountSat: "1", description: "Autonomous Agent Payment Test" });
  const createRes = await fetch("http://127.0.0.1:9740/createinvoice", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const invoiceData = await createRes.json();
  console.log("Invoice created:", invoiceData.serialized.substring(0, 35) + "...");

  // 2. Pay invoice programmatically
  const payParams = new URLSearchParams({ invoice: invoiceData.serialized });
  const payRes = await fetch("http://127.0.0.1:9740/payinvoice", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payParams
  });
  const payData = await payRes.json();
  console.log("Payment response:", payData);
}

main().catch(console.error);
