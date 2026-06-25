export async function sendOneSignalNotificationToUser(
  externalUserId: string,
  title: string,
  body: string,
) {
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      include_aliases: {
        external_id: [externalUserId],
      },
      target_channel: "push",
      headings: { en: title },
      contents: { en: body },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `OneSignal error: ${response.status} ${JSON.stringify(data)}`,
    );
  }

  return data;
}