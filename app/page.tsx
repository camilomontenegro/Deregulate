import Map from "./components/Map";

export default function Home() {
  return (
    <div className="font-sans min-h-screen p-8">
      <main className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Google Maps - Spain</h1>
        <Map />
      </main>
    </div>
  );
}
