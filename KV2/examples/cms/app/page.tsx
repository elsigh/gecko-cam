import PublicPage from "./(public)/[...slug]/page";

export default function HomePage() {
  return <PublicPage params={Promise.resolve({ slug: ["home"] })} />;
}
