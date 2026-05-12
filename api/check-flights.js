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

export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const apifyToken = process.env.APIFY_TOKEN;

  const results = [];
  const today = new Date();

  try {
    for (const destination of DESTINATIONS) {

      for (let i = 14; i <= 120; i += 14) {

        const outbound = addDays(today, i);
        const returnDate = addDays(today, i + 4);

        const input = {
          origin: "TLV",
          destination: destination.code,
          departureDate: outbound,
          returnDate: returnDate,
          currency: "USD"
        };

        const runResponse = await fetch(
          `https://api.apify.com/v2/acts/automation-lab~google-flights-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(input)
          }
        );

        const data = await runResponse.json();

        for (const flight of data) {

          const airline =
            flight.airline ||
            flight.airlines?.[0] ||
            "";

          const price =
            Number(
              String(flight.price || "")
                .replace("$", "")
                .replace(",", "")
            ) || 9999;

          if (
            airline.includes("EL AL") &&
            price <= MAX_PRICE
          ) {
            results.push({
              destination: destination.name,
              outbound,
              returnDate,
              price,
              airline
            });
          }
        }
      }
    }

    if (results.length > 0) {

      const message =
        "🔥 נמצאו טיסות EL AL זולות:\n\n" +
        results
          .slice(0, 10)
          .map(
            f =>
              `✈️ ${f.destination}\n📅 ${f.outbound} → ${f.returnDate}\n💵 ${f.price}$`
          )
          .join("\n\n");

      await fetch(
        `https://api.telegram.org/bot${telegramToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message
          })
        }
      );
    }

    return res.status(200).json({
      success: true,
      found: results.length,
      results
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}
