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

const MONTH_MAP = {
  "ינואר": 1,
  "פברואר": 2,
  "מרץ": 3,
  "אפריל": 4,
  "מאי": 5,
  "יוני": 6,
  "יולי": 7,
  "אוגוסט": 8,
  "ספטמבר": 9,
  "אוקטובר": 10,
  "נובמבר": 11,
  "דצמבר": 12
};

const ELAL_KEYWORDS = ["אלעל", "אל על", "elal", "el al"];

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

function googleFlightsLink(destination, outbound, returnDate) {
  return `https://www.google.com/travel/flights?q=Flights%20from%20TLV%20to%20${destination}%20on%20${outbound}%20returning%20${returnDate}&hl=en&curr=USD`;
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
    googleFlightsLink(destination, outbound, returnDate)
  );
}

function detectDestination(text) {
  for (const city in CITY_MAP) {
    if (text.includes(city)) return CITY_MAP[city];
  }
  return null;
}

function wantsElAlOnly(text) {
  return ELAL_KEYWORDS.some(k => text.toLowerCase().includes(k.toLowerCase()));
}

function extractExactDates(text) {
  const dates = text.match(/\d{1,2}\.\d{1,2}/g);
  if (!dates || dates.length < 2) return null;

  const year = new Date().getFullYear();

  const formatDate = shortDate => {
    const [day, month] = shortDate.split(".");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  return [{
    outbound: formatDate(dates[0]),
    returnDate: formatDate(dates[1])
  }];
}

function buildMonthSearches(text) {
  const year = new Date().getFullYear();

  for (const monthName in MONTH_MAP) {
    if (text.includes(monthName)) {
      const month = MONTH_MAP[monthName];
      const mm = String(month).padStart(2, "0");

      return [
        { outbound: `${year}-${mm}-03`, returnDate: `${year}-${mm}-07` },
        { outbound: `${year}-${mm}-10`, returnDate: `${year}-${mm}-14` },
        { outbound: `${year}-${mm}-17`, returnDate: `${year}-${mm}-21` },
        { outbound: `${year}-${mm}-24`, returnDate: `${year}-${mm}-28` }
      ];
    }
  }

  return null;
}

function buildDefaultSearches() {
  const today = new Date();

  return [
    { outbound: addDays(today, 21), returnDate: addDays(today, 25) },
    { outbound: addDays(today, 35), returnDate: addDays(today, 39) },
    { outbound: addDays(today, 49), returnDate: addDays(today, 53) },
    { outbound: addDays(today, 63), returnDate: addDays(today, 67) }
  ];
}

function buildSearches(text) {
  return extractExactDates(text) || buildMonthSearches(text) || buildDefaultSearches();
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
    return res.status(200).json({ message: "Telegram webhook ready" });
  }

  const apifyToken = process.env.APIFY_TOKEN;
  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const text = (message?.text || "").trim();

  res.status(200).json({ ok: true });

  if (!chatId || !text) return;

  if (text === "/start") {
    await sendTelegram(
      chatId,
      `✈️ הבוט פעיל!

אפשר לכתוב חופשי:
פאפוס
הכי זול לפאפוס
פאפוס ביולי
פאפוס 10.7 עד 18.7
אל על לפאפוס ביולי

אם לא תציין תאריכים — אחפש כמה אפשרויות קדימה.`
    );
    return;
  }

  const destination = detectDestination(text);

  if (!destination) {
    await sendTelegram(
      chatId,
      "לא הצלחתי להבין יעד 😅\nנסה למשל:\nפאפוס\nפאפוס ביולי\nרומא 10.7 עד 14.7"
    );
    return;
  }

  const elAlOnly = wantsElAlOnly(text);
  const searches = buildSearches(text);

  await sendTelegram(chatId, "מחפש טיסות... ✈️");

  try {
    let cheapest = null;

    for (const trip of searches) {
      const input = {
        origin: "TLV",
        destination,
        departureDate: trip.outbound,
        returnDate: trip.returnDate,
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

        if (elAlOnly && !airline.toLowerCase().includes("el al")) continue;

        if (!cheapest || price < cheapest.price) {
          cheapest = {
            airline,
            price,
            outbound: trip.outbound,
            returnDate: trip.returnDate,
            link: getBookingLink(flight, destination, trip.outbound, trip.returnDate)
          };
        }
      }
    }

    if (!cheapest) {
      await sendTelegram(chatId, "לא נמצאו טיסות 😢");
      return;
    }

    await sendTelegram(
      chatId,
      `✈️ נמצאה הטיסה הזולה ביותר

📍 יעד: ${destination}
📅 ${cheapest.outbound} עד ${cheapest.returnDate}
🏢 ${cheapest.airline}
💵 ${cheapest.price}$

🔗 ${cheapest.link}`
    );
  } catch (error) {
    await sendTelegram(chatId, `שגיאה בחיפוש:\n${error.message}`);
  }
}
