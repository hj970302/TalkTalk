export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { player_ids, title, message } = req.body;

  const response = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${process.env.ONESIGNAL_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: 'fa3e79db-55b2-4d23-b315-c0f131287f7e',
      include_player_ids: player_ids,
      headings: { en: title },
      contents: { en: message },
      url: 'https://talk-talk-phi.vercel.app'
    })
  });

  const data = await response.json();
  res.status(200).json(data);
}
