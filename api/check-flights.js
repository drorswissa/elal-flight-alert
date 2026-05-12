const DESTINATIONS = [
  { code: "ATH", name: "אתונה" },
  { code: "LCA", name: "לרנקה" },
  { code: "PFO", name: "פאפוס" },
  { code: "BUD", name: "בודפשט" },
  { code: "BUH", name: "בוקרשט" },
  { code: "PAR", name: "פריז" },
  { code: "ROM", name: "רומא" },
  { code: "LON", name: "לונדון" }
];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function parsePrice(value) {
  return Number(String(value || "").replace("$", "").replace(",", "").trim()) || 9999;
}

function getAirline(flight) {
  return (
    flight.airline ||
    flight.airlines?.join(", ") ||
    flight.flights?.map(f => f.airline).join(", ") ||
    ""
  );
}

export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const apifyToken = process.env.APIFY_TOKEN;

  const today = new Date();
  const outbound = addDays(today, 30);
  const returnDate = addDays(today, 34);

  const results = [];

  try {
    for (const destination of DESTINATIONS) {
      const input = {
        origin: "TLV",
        destination: destination.code,
        departureDate: outbound,
        returnDate,
        currency: "USD"
      };

      const response = await fetch(
        `https://api.apify.com/v2/acts/automation-lab~google-flights-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input)
        }
      );

      const data = await response.json();

      let cheapest = null;

      for (const flight of data) {
        const airline = getAirline(flight);
        const price = parsePrice(flight.price);

        if (!cheapest || price < cheapest.price) {
          cheapest = {
            destination: destination.name,
            code: destination.code,
            airline,
            price
          };
        }
      }

      results.push(
        cheapest || {
          destination: destination.name,
          code: destination.code,
          airline: "לא נמצא",
          price: null
        }
      );
    }

    const message =
      "✈️ בדיקת מחירים מהירה:\n\n" +
      results.map(r =>
        `✈️ ${r.destination} (${r.code})\n` +
        `📅 ${outbound} עד ${returnDate}\n` +
        `🏢 ${r.airline}\n` +
        `💵 ${r.price ? r.price + "$" : "לא נמצא"}`
      ).join("\n\n");

    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });

    return res.status(200).json({
      success: true,
      checked: DESTINATIONS.length,
      outbound,
      returnDate,
      results
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
