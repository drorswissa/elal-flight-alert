const AIRLINES = ["EL AL", "Arkia", "Israir"];

const CITY_MAP = {
  "אתונה": "ATH",
  "לרנקה": "LCA",
  "פאפוס": "PFO",
  "בודפשט": "BUD",
  "בוקרשט": "BUH",
  "רומא": "ROM",
  "פריז": "PAR",
  "לונדון": "LON"
};

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

function googleFlightsLink(destination, outbound, returnDate) {
  return `https://www.google.com/travel/flights?q=Flights%20from%20TLV%20to%20${destination}%20on%20${outbound}%20returning%20${returnDate}`;
}

function getBookingLink(flight, destination, outbound, returnDate) {
  return (
    flight.bookingLink ||
    flight.booking_link ||
    flight.bookLink ||
    flight.link ||
    flight.deeplink ||
    flight.deepLink ||
    flight.url ||
    flight.purchaseLink ||
    flight.purchase_link ||
    googleFlightsLink(destination, outbound, returnDate)
  );
}

function formatHebrewDate(shortDate) {
  const [day, month] = shortDate.split(".");
  return `2026-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseHebrewSearch(text) {
  let destination = null;

  for (const city in CITY_MAP) {
    if (text.includes(city)) {
      destination = CITY_MAP[city];
      break;
    }
  }

  const dates = text.match(/\d{1,2}\.\d{1,2}/g);

  if (!destination || !dates || dates.length < 2) {
    return null;
  }

  return {
    destination,
    outbound: formatHebrewDate(dates[0]),
    returnDate: formatHebrewDate(dates[1])
  };
}

async function sendTelegram(chatId, text) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
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
      "הבוט פעיל ✈️\n\nאפשר לכתוב בעברית חופשית, למשל:\nפאפוס 10.7 עד 14.7\nרומא 1.8 עד 5.8\nאתונה 12.9 עד 16.9\n\nיעדים זמינים:\nאתונה, לרנקה, פאפוס, בודפשט, בוקרשט, פריז, רומא, לונדון"
    );

    return res.status(200).json({ ok: true });
  }

  const search = parseHebrewSearch(text);

  if (!search) {
    await sendTelegram(
      chatId,
      "לא הצלחתי להבין את החיפוש.\nכתוב למשל:\nפאפוס 10.7 עד 14.7\nאו:\nרומא 1.8 עד 5.8"
    );

    return res.status(200).json({ ok: true });
  }

  const { destination, outbound, returnDate } = search;

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
          price,
          link: getBookingLink(flight, destination, outbound, returnDate)
        };
      }
    }

    const fallbackLink = googleFlightsLink(destination, outbound, returnDate);

    if (!cheapest) {
      await sendTelegram(
        chatId,
        `לא נמצאה טיסה של אל על / ארקיע / ישראייר.\n\n📅 ${outbound} עד ${returnDate}\n🔗 ${fallbackLink}`
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
        `🔗 קישור להזמנה/חיפוש:\n${cheapest.link}`
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    await sendTelegram(chatId, `שגיאה בחיפוש: ${error.message}`);
    return res.status(200).json({ ok: false });
  }
}
