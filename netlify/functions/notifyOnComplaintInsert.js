// netlify/functions/notifyNewComplaint.js
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!ONESIGNAL_REST_KEY || !ONESIGNAL_APP_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "OneSignal credentials missing in Netlify environment" }),
    };
  }

  try {
    const { complaint } = JSON.parse(event.body || "{}");

    if (!complaint || !complaint.id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid complaint data" }),
      };
    }

    // ✅ ترميز المفتاح بشكل صحيح لـ Basic Auth
    const auth = Buffer.from(`:${ONESIGNAL_REST_KEY}`).toString("base64");

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["Subscribed Users"], // أو "Subscribed Users"
      headings: { ar: "شكوى جديدة!" },
      contents: {
        ar: `من: ${complaint.name || "عميل"} - ${complaint.phone || ""}`
      },
      url: "https://admin-complants-calamari.netlify.app/", // رابط لوحة التحكم
      chrome_web_image: "https://admin-complants-calamari.netlify.app/icon-192.png"
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    return {
      statusCode: response.status,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Function failed", details: err.message })
    };
  }
};
