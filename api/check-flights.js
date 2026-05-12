const DESTINATIONS = [
  { code: "ATH", name: "אתונה" },
  { code: "LCA", name: "לרנקה" },
  { code: "BUD", name: "בודפשט" },
  { code: "PAR", name: "פריז" },
  { code: "ROM", name: "רומא" },
  { code: "LON", name: "לונדון" }
];

const DATES = [
  "2026-06-20",
  "2026-06-27",
  "2026-07-04",
  "2026-07-11"
];

export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const serpApiKey = process.env.SERPAPI_KEY;

  const maxPrice = 220;
  const results = [];

  try {
    for (const destination of DESTINATIONS) {
      for (const date of DATES) {
        const url =
          `https://serpapi.com/search.json?engine=google_flights` +
          `&departure_id=TLV` +
          `&arrival_id=${destination.code}` +
          `&outbound_date=${date}` +
          `&currency=USD` +
          `&hl=en` +
          `&api_key=${serpApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        const flights = [
          ...(data.best_flights || []),
          ...(data.other_flights || [])
        ];

        for (const flight of flights) {
          const price = Number(flight.price || 9999);
          const airline = flight.flights?.[0]?.airline || "";

          if (airline.includes("EL AL") && price < maxPrice) {
            results.push({
              destination: destination.name,
              code: destination.code,
              date,
              airline,
              price
            });
          }
        }
      }
    }

    if (results.length > 0) {
      const message =
        "🔥 נמצאו טיסות EL AL מתחת ל-220$:\n\n" +
        results
          .map(
            r =>
              `✈️ ${r.destination} (${r.code})\n📅 ${r.date}\n💵 ${r.price}$\n`
          )
          .join("\n");

      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message
        })
      });
    }

    return res.status(200).json({
      checked: DESTINATIONS.length * DATES.length,
      found: results.length,
      results
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
