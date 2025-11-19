// netlify/functions/notify.js

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ✅ قراءة من متغيرات البيئة (آمنة)
  const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;
  const CUSTOMER_APP_ID = process.env.ONESIGNAL_CUSTOMER_APP_ID;
  const ADMIN_APP_ID = process.env.ONESIGNAL_ADMIN_APP_ID;

  if (!ONESIGNAL_REST_KEY || !CUSTOMER_APP_ID || !ADMIN_APP_ID) {
    console.error("❌ Missing environment variables");
    return { statusCode: 500, body: "Server misconfiguration" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { type, data } = body;

    if (!type || !data) {
      return { statusCode: 400, body: "Missing 'type' or 'data'" };
    }

    let payload;

    if (type === "new_complaint") {
      payload = {
        app_id: ADMIN_APP_ID,
        included_segments: ["Subscribed Users"],
        headings: { ar: "شكوى جديدة!" },
        contents: {
          ar: `من: ${data.customer_name || "عميل"}${data.customer_phone ? " - " + data.customer_phone : ""}`
        },
        url: "https://admin-complants-calamari.netlify.app/"
      };
    }
    else if (type === "broadcast_to_customers") {
      payload = {
        app_id: CUSTOMER_APP_ID,
        included_segments: ["Subscribed Users"],
        headings: { ar: data.title || "إشعار مهم" },
        contents: { ar: data.message || "" },
        url: data.url || "https://your-restaurant-site.com/"
      };
    }
    else {
      return { statusCode: 400, body: "Invalid notification type" };
    }

    const auth = Buffer.from(`:${ONESIGNAL_REST_KEY}`).toString("base64");
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
    console.error("Function error:", err.message);
    return { statusCode: 500, body: "Internal error" };
  }
};
