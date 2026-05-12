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

      for (let i = 14; i <= 180; i += 7) {

        const outbound = addDays(today, i);

        [3, 4, 5].forEach(async (nights) => {

          const returnDate = addDays(new Date(outbound), nights);

          const input = {
            origin: "TLV",
            destination: destination.code,
            departureDate: outbound,
            returnDate: returnDate,
            currency: "USD"
          };

          const response = await fetch(
            `https://api.apify.com/v2/acts/automation-lab~google-flights-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify(input)
            }
          );

          const data = await response.json();

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

            const validAirline =
              ["EL AL", "Arkia", "Israir"]
                .some(a => airline.includes(a));

            if (validAirline && price <= MAX_PRICE) {

              results.push({
                destination: destination.name,
                outbound,
                returnDate,
                nights,
                airline,
                price
              });

            }
          }

        });

      }

    }

    setTimeout(async () => {

      if (results.length > 0) {

        const message =
          "🔥 נמצאו טיסות זולות:\n\n" +
          results
            .slice(0, 10)
            .map(
              f =>
                `✈️ ${f.destination}\n` +
                `🛫 ${f.outbound}\n` +
                `🛬 ${f.returnDate}\n` +
                `🌙 ${f.nights} לילות\n` +
                `🏢 ${f.airline}\n` +
                `💵 ${f.price}$`
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

    }, 15000);

    return res.status(200).json({
      checked: DESTINATIONS.length,
      found: results.length,
      results
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }

}
