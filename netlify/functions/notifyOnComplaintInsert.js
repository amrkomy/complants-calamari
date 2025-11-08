// netlify/functions/notifyOnComplaintInsert.js
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;

exports.handler = async (event) => {
  // ✅ السماح فقط بـ POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed. Use POST." })
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const complaint = payload.record; // ← لأن Supabase يُرسل السجل تحت "record"

    if (!complaint) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'record' in payload" })
      };
    }

    const auth = Buffer.from(`:${ONESIGNAL_REST_KEY}`).toString("base64");

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ["Subscribed Users"], // ✅ غيره من "All"
        headings: { ar: "شكوى جديدة!" },
        contents: { 
          ar: `من: ${complaint.customer_name || "عميل"}`
        },
        url: "https://admin-complants-calamari.netlify.app/"
      })
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
      body: JSON.stringify({ error: err.message })
    };
  }
};
