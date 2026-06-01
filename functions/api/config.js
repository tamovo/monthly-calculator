export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  return Response.json(
    { clientId: env.GOOGLE_CLIENT_ID ?? '' },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  );
}
