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

const AIRLINES = ["EL AL", "Arkia", "Israir"];

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

function isWantedAirline(airline) {
  return AIRLINES.some(a => airline.toLowerCase().includes(a.toLowerCase()));
}

function flightLink(destination, outbound, returnDate) {
  return `https://www.google.com/travel/flights?q=Flights%20from%20TLV%20to%20${destination}%20on%20${outbound}%20returning%20${returnDate}`;
}

export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const apifyToken = process.env.APIFY_TOKEN;

  const today = new Date();

  // כרגע: חודש קדימה, 4 לילות
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

        if (!isWantedAirline(airline)) continue;

        if (!cheapest || price < cheapest.price) {
          cheapest = {
            destination: destination.name,
            code: destination.code,
            airline,
            price,
            link: flightLink(destination.code, outbound, returnDate)
          };
        }
      }

      results.push(
        cheapest || {
          destination: destination.name,
          code: destination.code,
          airline: "לא נמצאה טיסה באל על / ארקיע / ישראייר",
          price: null,
          link: flightLink(destination.code, outbound, returnDate)
        }
      );
    }

    const message =
      "✈️ בדיקת מחירים - אל על / ארקיע / ישראייר:\n\n" +
      results.map(r =>
        `✈️ ${r.destination} (${r.code})\n` +
        `📅 ${outbound} עד ${returnDate}\n` +
        `🏢 ${r.airline}\n` +
        `💵 ${r.price ? r.price + "$" : "לא נמצא"}\n` +
        `🔗 ${r.link}`
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
