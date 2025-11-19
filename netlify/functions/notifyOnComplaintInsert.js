// netlify/functions/notify.js

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_KEY) {
    console.error("❌ Missing OneSignal credentials in Netlify env");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server config error: missing OneSignal keys" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { type, data } = body;

    if (!type || !data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'type' or 'data'" })
      };
    }

    let payload;

    if (type === "new_complaint") {
      // ➡️ إشعار للإدارة فقط
      payload = {
        app_id: ONESIGNAL_APP_ID,
        filters: [{ field: "tag", key: "role", relation: "=", value: "admin" }],
        headings: { ar: "شكوى جديدة!" },
        contents: {
          ar: `من: ${data.customer_name || "عميل"}${data.customer_phone ? " - " + data.customer_phone : ""}`
        },
        url: "https://admin-complants-calamari.netlify.app/"
      };
    } 
    else if (type === "broadcast_to_customers") {
      // ➡️ إشعار للعملاء فقط
      payload = {
        app_id: ONESIGNAL_APP_ID,
        filters: [{ field: "tag", key: "role", relation: "=", value: "customer" }],
        headings: { ar: data.title || "إشعار جديد" },
        contents: { ar: data.message || "" },
        url: data.url || "https://your-restaurant-site.com/"
      };
    } 
    else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid notification type" })
      };
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
