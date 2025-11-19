// netlify/functions/notify.js

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405 };

  // ⚠️ كل App ID له REST API Key خاص به
  const CUSTOMER_REST_KEY = process.env.ONESIGNAL_CUSTOMER_REST_KEY; // للمطعم
  const ADMIN_REST_KEY = process.env.ONESIGNAL_ADMIN_REST_KEY;       // للإدارة

  const CUSTOMER_APP_ID = "4d4396ed-4766-4646-8449-07fa9c7db4f1";
  const ADMIN_APP_ID = "fb14d9b6-5b07-47c7-bc70-ff2495372d38";

  try {
    const { type, data } = JSON.parse(event.body || "{}");

    let app_id, rest_key, contents;

    if (type === "new_complaint") {
      app_id = ADMIN_APP_ID;
      rest_key = ADMIN_REST_KEY;
      contents = { ar: `شكوى جديدة من: ${data.customer_name || "عميل"}` };
    } else if (type === "broadcast_to_customers") {
      app_id = CUSTOMER_APP_ID;
      rest_key = CUSTOMER_REST_KEY;
      contents = { ar: data.message || "" };
    } else {
      return { statusCode: 400, body: "Invalid type" };
    }

    if (!rest_key) {
      return { statusCode: 500, body: "Missing REST key for this app" };
    }

    const payload = {
      app_id,
      included_segments: ["Subscribed Users"],
      headings: { ar: "إشعار من Cesaro" },
      contents,
      url: data.url || "https://admin-complants-calamari.netlify.app/"
    };

    // ✅ استخدام المفتاح الصحيح لكل تطبيق
    const auth = Buffer.from(`:${rest_key}`).toString("base64");
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });

    return { statusCode: res.status, body: JSON.stringify(await res.json()) };
  } catch (e) {
    console.error("Error:", e.message);
    return { statusCode: 500, body: "Internal error" };
  }
};
