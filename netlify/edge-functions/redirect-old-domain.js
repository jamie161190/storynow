export default async (request, context) => {
  const url = new URL(request.url);
  const host = url.hostname;

  if (host === 'storytold.ai' || host === 'www.storytold.ai') {
    const newUrl = `https://heartheirname.com${url.pathname}${url.search}`;
    return new Response(null, {
      status: 301,
      headers: { Location: newUrl }
    });
  }

  return context.next();
};

export const config = {
  path: "/*"
};
