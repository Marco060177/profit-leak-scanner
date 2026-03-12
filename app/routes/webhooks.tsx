export async function action() {
  return new Response("Unauthorized", { status: 401 });
}

export async function loader() {
  return new Response("Unauthorized", { status: 401 });
}