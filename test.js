const fs = require('fs');

async function run() {
  try {
    const imgPath = 'C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\c373401a-ad36-412b-9dee-4a88b854008d\\.user_uploaded\\media_1787602648963.png';
    const imgData = fs.readFileSync(imgPath).toString('base64');
    const imageBase64 = 'data:image/png;base64,' + imgData;

    const body = {
      imageBase64,
      symbol: "BTCUSDT",
      timeframe: "1h",
      tradeDuration: "1 day",
      provider: "anthropic",
      model: "claude-sonnet-5",
      platform: "mobile"
    };

    console.log("Sending request to local API...");
    const res = await fetch("http://localhost:3000/api/mobile-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));

  } catch (error) {
    console.error("Test Error:", error);
  }
}

run();
