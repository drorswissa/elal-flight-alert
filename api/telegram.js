const AIRLINES = ["EL AL", "Arkia", "Israir"];

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

async function sendTelegram(chatId, text) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ message: "Telegram webhook is ready" });
  }

  const apifyToken = process.env.APIFY_TOKEN;
  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const text = message?.text || "";

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  if (text === "/start") {
    await sendTelegram(
      chatId,
      "הבוט פעיל ✈️\n\nחיפוש לדוגמה:\n/check PFO 2026-07-10 2026-07-14\n\nקודים לדוגמה:\nATH אתונה\nLCA לרנקה\nPFO פאפוס\nBUD בודפשט\nBUH בוקרשט\nPAR פריז\nROM רומא\nLON לונדון"
    );

    return res.status(200).json({ ok: true });
  }

  if (!text.startsWith("/check")) {
    await sendTelegram(
      chatId,
      "שלח חיפוש בפורמט:\n/check PFO 2026-07-10 2026-07-14"
    );

    return res.status(200).json({ ok: true });
  }

  const parts = text.trim().split(/\s+/);

  if (parts.length !== 4) {
    await sendTelegram(
      chatId,
      "פורמט לא תקין.\nכתוב למשל:\n/check PFO 2026-07-10 2026-07-14"
    );

    return res.status(200).json({ ok: true });
  }

  const destination = parts[1].toUpperCase();
  const outbound = parts[2];
  const returnDate = parts[3];

  await sendTelegram(chatId, "בודק טיסות... ✈️");

  try {
    const input = {
      origin: "TLV",
      destination,
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
          airline,
          price
        };
      }
    }

    const link = flightLink(destination, outbound, returnDate);

    if (!cheapest) {
      await sendTelegram(
        chatId,
        `לא נמצאה טיסה של אל על / ארקיע / ישראייר.\n\n🔗 ${link}`
      );

      return res.status(200).json({ ok: true });
    }

    await sendTelegram(
      chatId,
      `✈️ נמצאה טיסה\n` +
        `יעד: ${destination}\n` +
        `📅 ${outbound} עד ${returnDate}\n` +
        `🏢 ${cheapest.airline}\n` +
        `💵 ${cheapest.price}$\n` +
        `🔗 ${link}`
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    await sendTelegram(chatId, `שגיאה בחיפוש: ${error.message}`);
    return res.status(200).json({ ok: false });
  }
}
