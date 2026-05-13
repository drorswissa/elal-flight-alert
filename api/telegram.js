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

const ELAL_KEYWORDS = [
  "אלעל",
  "אל על",
  "elal",
  "el al"
];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function parsePrice(value) {
  return Number(
    String(value || "")
      .replace("$", "")
      .replace(",", "")
      .trim()
  ) || 9999;
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
    googleFlightsLink(destination, outbound, returnDate)
  );
}

function detectDestination(text) {
  for (const city in CITY_MAP) {
    if (text.includes(city)) {
      return CITY_MAP[city];
    }
  }

  return null;
}

function extractDates(text) {
  const dates = text.match(/\d{1,2}\.\d{1,2}/g);

  if (!dates || dates.length < 2) {
    return null;
  }

  const year = new Date().getFullYear();

  const formatDate = shortDate => {
    const [day, month] = shortDate.split(".");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  return {
    outbound: formatDate(dates[0]),
    returnDate: formatDate(dates[1])
  };
}

function wantsElAlOnly(text) {
  return ELAL_KEYWORDS.some(k =>
    text.toLowerCase().includes(k.toLowerCase())
  );
}

async function sendTelegram(chatId, text) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  await fetch(
    `https://api.telegram.org/bot${telegramToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    }
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({
      message: "Telegram webhook ready"
    });
  }

  const apifyToken = process.env.APIFY_TOKEN;

  const message = req.body?.message;
  const chatId = message?.chat?.id;
  const text = (message?.text || "").trim();

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  if (text === "/start") {
    await sendTelegram(
      chatId,
      `✈️ הבוט פעיל!

אפשר לכתוב חופשי למשל:

פאפוס
הכי זול לפאפוס
רומא 10.7 עד 14.7
אלעל לפראג
הכי זול לבודפשט

אם לא תציין תאריכים —
אחפש כמה חודשים קדימה ואחזיר את הכי זול.`
    );

    return res.status(200).json({ ok: true });
  }

  const destination = detectDestination(text);

  if (!destination) {
    await sendTelegram(
      chatId,
      "לא הצלחתי להבין יעד 😅\n\nנסה למשל:\nפאפוס\nרומא 10.7 עד 14.7\nהכי זול לבוקרשט"
    );

    return res.status(200).json({ ok: true });
  }

  const elAlOnly = wantsElAlOnly(text);

  const explicitDates = extractDates(text);

  await sendTelegram(chatId, "מחפש טיסות... ✈️");

  try {
    const searches = [];

    if (explicitDates) {
      searches.push(explicitDates);
    } else {
      const today = new Date();

      for (let i = 14; i <= 120; i += 14) {
        searches.push({
          outbound: addDays(today, i),
          returnDate: addDays(today, i + 4)
        });
      }
    }

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
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(input)
        }
      );

      const data = await response.json();

      for (const flight of data) {
        const airline = getAirline(flight);
        const price = parsePrice(flight.price);

        if (
          elAlOnly &&
          !airline.toLowerCase().includes("el al")
        ) {
          continue;
        }

        if (!cheapest || price < cheapest.price) {
          cheapest = {
            airline,
            price,
            outbound: trip.outbound,
            returnDate: trip.returnDate,
            link: getBookingLink(
              flight,
              destination,
              trip.outbound,
              trip.returnDate
            )
          };
        }
      }
    }

    if (!cheapest) {
      await sendTelegram(
        chatId,
        "לא נמצאו טיסות 😢"
      );

      return res.status(200).json({ ok: true });
    }

    await sendTelegram(
      chatId,
      `✈️ נמצאה טיסה\n\n` +
      `📍 יעד: ${destination}\n` +
      `📅 ${cheapest.outbound} עד ${cheapest.returnDate}\n` +
      `🏢 ${cheapest.airline}\n` +
      `💵 ${cheapest.price}$\n\n` +
      `🔗 ${cheapest.link}`
    );

    return res.status(200).json({ ok: true });

  } catch (error) {

    await sendTelegram(
      chatId,
      `שגיאה:\n${error.message}`
    );

    return res.status(200).json({
      ok: false
    });

  }
}
