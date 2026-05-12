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
const MAX_PRICE = 220;

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

export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const apifyToken = process.env.APIFY_TOKEN;

  const today = new Date();
  const cheapestByDestination = {};
  let checked = 0;

  try {
    for (const destination of DESTINATIONS) {
      cheapestByDestination[destination.code] = {
        destination: destination.name,
        code: destination.code,
        found: false,
        price: 9999
      };

      // חיפוש 4 חודשים קדימה, כל שבועיים, 4 לילות
      for (let i = 14; i <= 120; i += 14) {
        const outbound = addDays(today, i);
        const returnDate = addDays(today, i + 4);

        checked++;

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

        for (const flight of data) {
          const airline = getAirline(flight);
          const price = parsePrice(flight.price);

          if (!isWantedAirline(airline)) continue;

          if (price < cheapestByDestination[destination.code].price) {
            cheapestByDestination[destination.code] = {
              found: true,
              destination: destination.name,
              code: destination.code,
              outbound,
              returnDate,
              airline,
              price
            };
          }
        }
      }
    }

    const results = Object.values(cheapestByDestination);

    const message =
      "✈️ סיכום יומי - הטיסות הכי זולות שמצאתי:\n\n" +
      results
        .map(r => {
          if (!r.found) {
            return `❌ ${r.destination} (${r.code})\nלא נמצאה טיסה של אל על / ארקיע / ישראייר`;
          }

          const cheapMark = r.price <= MAX_PRICE ? "🔥" : "ℹ️";

          return (
            `${cheapMark} ${r.destination} (${r.code})\n` +
            `📅 ${r.outbound} עד ${r.returnDate}\n` +
            `🏢 ${r.airline}\n` +
            `💵 ${r.price}$`
          );
        })
        .join("\n\n");

    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    return res.status(200).json({
      success: true,
      checked,
      results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
