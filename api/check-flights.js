const DESTINATIONS = [
  { code: "ATH", name: "אתונה" },
  { code: "LCA", name: "לרנקה" },
  { code: "BUD", name: "בודפשט" },
  { code: "PAR", name: "פריז" },
  { code: "ROM", name: "רומא" },
  { code: "LON", name: "לונדון" }
];

const MAX_PRICE = 220;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function buildDates() {
  const dates = [];
  const today = new Date();

  // מחפש 6 חודשים קדימה, פעם בשבוע
  for (let i = 14; i <= 180; i += 7) {
    const outbound = addDays(today, i);

    // חופשות של 3, 4, 5 לילות
   [3, 4, 5].forEach((nights) => {
      const returnDate = addDays(outbound, nights);
      dates.push({ outbound, returnDate, nights });
    });
  }

  return dates;
}

export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const serpApiKey = process.env.SERPAPI_KEY;

  const dates = buildDates();
  const results = [];

  try {
    for (const destination of DESTINATIONS) {
      for (const trip of dates) {
        const url =
          `https://serpapi.com/search.json?engine=google_flights` +
          `&departure_id=TLV` +
          `&arrival_id=${destination.code}` +
          `&outbound_date=${trip.outbound}` +
          `&return_date=${trip.returnDate}` +
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

          if (airline.includes("EL AL") && price <= MAX_PRICE) {
            results.push({
              destination: destination.name,
              code: destination.code,
              outbound: trip.outbound,
              returnDate: trip.returnDate,
              nights: trip.nights,
              airline,
              price
            });
          }
        }
      }
    }

    if (results.length > 0) {
      const message =
        "🔥 נמצאו טיסות הלוך־חזור של EL AL עד 220$:\n\n" +
        results
          .slice(0, 10)
          .map(
            r =>
              `✈️ ${r.destination} (${r.code})\n📅 ${r.outbound} עד ${r.returnDate}\n🌙 ${r.nights} לילות\n💵 ${r.price}$`
          )
          .join("\n\n");

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
      checked: DESTINATIONS.length * dates.length,
      found: results.length,
      results
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
