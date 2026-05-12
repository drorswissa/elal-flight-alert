export default async function handler(req, res) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const serpApiKey = process.env.SERPAPI_KEY;

  const url = `https://serpapi.com/search.json?engine=google_flights&departure_id=TLV&arrival_id=ATH&outbound_date=2026-06-20&currency=USD&hl=en&api_key=${serpApiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const flights = data.best_flights || [];

    if (flights.length === 0) {
      return res.status(200).json({ message: "No flights found" });
    }

    const flight = flights[0];

    const price = flight.price || 9999;
    const airline =
      flight.flights?.[0]?.airline || "Unknown Airline";

    if (airline.includes("EL AL") && price < 220) {
      const message = `✈️ נמצאה טיסת EL AL לאתונה ב-${price}$`;

      await fetch(
        `https://api.telegram.org/bot${telegramToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
          }),
        }
      );

      return res.status(200).json({
        success: true,
        message,
      });
    }

    return res.status(200).json({
      success: false,
      airline,
      price,
      message: "No cheap EL AL flights found",
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
}
