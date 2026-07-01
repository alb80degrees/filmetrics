'use client';
import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { toPng } from 'html-to-image';
import { Film, Clock, Star, Activity, Terminal, HelpCircle, X, Camera, FileText, Upload } from 'lucide-react';

interface LetterboxdRow {
  Date: string;
  Name: string;
  Year: string;
  Rating: string;
  'Watched Date'?: string;
}

interface WrappedData {
  username: string;
  year: number;
  totalMovies: number;
  totalMinutes: number;
  averageRating: number;
  mainstreamIndex: number;
  longestFilm: { name: string; runtime: number };
  topGenres: { name: string; count: number }[];
  topDirectors: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  decades: { name: string; count: number }[];
  ratingDistribution: { [key: string]: number };
}

const TMDB_GENRES: Record<number, string> = {
  28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
  99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 36: 'history',
  27: 'horror', 10402: 'music', 9648: 'mystery', 10749: 'romance', 878: 'sci-fi',
  10770: 'tv movie', 53: 'thriller', 10752: 'war', 37: 'western'
};

const LOWKEY_COLORS = [
  'bg-zinc-300', 'bg-zinc-400', 'bg-zinc-500', 'bg-zinc-600', 'bg-zinc-700'
];

const SYSTEM_LOGS = [
  " > reading csv... ",
  " > fetching metadata from tmdb... ",
  " > parsing genres... ",
  " > calculating aggregates... ",
  " > mapping data relationships... ",
  " > rendering ui... "
];

export default function Filmetrics() {
  const [username, setUsername] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const [wrappedData, setWrappedData] = useState<WrappedData | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [manualData, setManualData] = useState('');
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLogIndex((prev) => (prev + 1) % SYSTEM_LOGS.length);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [loading]);

  const exportImage = () => {
    if (dashboardRef.current) {
      toPng(dashboardRef.current, { backgroundColor: '#09090b' })
        .then((dataUrl) => {
          const link = document.createElement('a');
          link.download = `filmetrics-${wrappedData?.username || 'review'}-${wrappedData?.year || ''}.png`;
          link.href = dataUrl;
          link.click();
        })
        .catch((err) => {
          console.error('failed to export image', err);
        });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !username) return;
    setLoading(true);
    setLoadingProgress(0);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        await processLetterboxdData(results.data as LetterboxdRow[]);
      },
    });
  };

  const handleManualEntry = () => {
    if (!manualData.trim()) return;
    if (!username) {
      alert('enter a username before processing a manual list.');
      return;
    }
    const rows: LetterboxdRow[] = manualData
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [Name, Year, Rating] = line.split(',');
        return {
          Date: new Date(selectedYear, 0, 1).toISOString(),
          Name: (Name || '').trim(),
          Year: (Year || '').trim(),
          Rating: (Rating || '').trim(),
        };
      })
      .filter((row) => row.Name && row.Year);

    if (rows.length === 0) {
      alert('could not parse any rows. use format: Movie Name, Year, Rating');
      return;
    }

    setShowInstructions(false);
    setLoading(true);
    setLoadingProgress(0);
    processLetterboxdData(rows);
  };

  const processLetterboxdData = async (data: LetterboxdRow[]) => {
    const tmdbKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!tmdbKey) {
      alert("missing tmdb api key in .env.local.");
      setLoading(false);
      return;
    }

    const filteredData = data.filter((row) => {
      const dateStr = row['Watched Date'] || row.Date;
      if (!dateStr) return false;
      return new Date(dateStr).getFullYear() === selectedYear;
    });

    if (filteredData.length === 0) {
      alert(`no records found for ${selectedYear}.`);
      setLoading(false);
      return;
    }

    let totalRating = 0;
    let ratedCount = 0;
    let totalMinutes = 0;
    let totalPopularity = 0;
    let longestFilm = { name: "none", runtime: 0 };

    const genresMap: { [key: string]: number } = {};
    const directorsMap: { [key: string]: number } = {};
    const actorsMap: { [key: string]: number } = {};
    const decadesMap: { [key: string]: number } = {};
    const ratingDist: { [key: string]: number } = {
      '0.5': 0, '1.0': 0, '1.5': 0, '2.0': 0, '2.5': 0,
      '3.0': 0, '3.5': 0, '4.0': 0, '4.5': 0, '5.0': 0
    };

    const movieCache = new Map();

    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      
      if (row.Rating) {
        const r = parseFloat(row.Rating);
        if (!isNaN(r)) {
          totalRating += r;
          ratedCount++;
          const rStr = r.toFixed(1);
          if (ratingDist[rStr] !== undefined) ratingDist[rStr]++;
        }
      }

      const releaseYear = parseInt(row.Year);
      if (!isNaN(releaseYear)) {
        const decade = Math.floor(releaseYear / 10) * 10;
        decadesMap[`${decade}s`] = (decadesMap[`${decade}s`] || 0) + 1;
      }

      const cacheKey = `${row.Name}-${row.Year}`;
      let movieDetails = movieCache.get(cacheKey);

      if (!movieDetails) {
        try {
          const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(row.Name)}&year=${row.Year}&api_key=${tmdbKey}`
          );
          const searchData = await searchRes.json();

          if (searchData.results && searchData.results.length > 0) {
            const firstResult = searchData.results[0];
            const tmdbId = firstResult.id;
            const popularity = firstResult.popularity || 0;
            const genres = (firstResult.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean);

            const detailRes = await fetch(
              `https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=credits&api_key=${tmdbKey}`
            );
            const detailData = await detailRes.json();

            const directorObj = detailData.credits?.crew?.find((c: any) => c.job === 'Director');
            const director = directorObj ? directorObj.name.toLowerCase() : 'unknown';
            const runtime = detailData.runtime || 0;
            
            const actors = (detailData.credits?.cast || []).slice(0, 3).map((a: any) => a.name.toLowerCase());

            movieDetails = { genres, director, runtime, actors, popularity };
            movieCache.set(cacheKey, movieDetails);
          } else {
            movieDetails = { genres: [], director: 'unknown', runtime: 100, actors: [], popularity: 0 };
            movieCache.set(cacheKey, movieDetails);
          }
        } catch (error) {
          movieDetails = { genres: [], director: 'unknown', runtime: 100, actors: [], popularity: 0 };
        }
      }

      totalMinutes += movieDetails.runtime;
      totalPopularity += movieDetails.popularity;
       
      if (movieDetails.runtime > longestFilm.runtime) {
        longestFilm = { name: row.Name.toLowerCase(), runtime: movieDetails.runtime };
      }
      
      movieDetails.genres.forEach((g: string) => { genresMap[g] = (genresMap[g] || 0) + 1; });
      movieDetails.actors.forEach((a: string) => { actorsMap[a] = (actorsMap[a] || 0) + 1; });
      
      if (movieDetails.director !== 'unknown') {
        directorsMap[movieDetails.director] = (directorsMap[movieDetails.director] || 0) + 1;
      }

      setLoadingProgress(Math.round(((i + 1) / filteredData.length) * 100));
    }

    const sortMap = (map: Record<string, number>) => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
    const sortDecades = (map: Record<string, number>) => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => parseInt(a.name) - parseInt(b.name));

    setWrappedData({
      username,
      year: selectedYear,
      totalMovies: filteredData.length,
      totalMinutes,
      averageRating: ratedCount > 0 ? totalRating / ratedCount : 0,
      mainstreamIndex: Math.round(totalPopularity / filteredData.length),
      longestFilm,
      topGenres: sortMap(genresMap),
      topDirectors: sortMap(directorsMap),
      topActors: sortMap(actorsMap),
      decades: sortDecades(decadesMap),
      ratingDistribution: ratingDist
    });

    setTimeout(() => setLoading(false), 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6 text-zinc-400 font-mono text-sm">
        <div className="w-full max-w-sm flex flex-col gap-4">
          <div className="flex items-center gap-3 text-zinc-500 mb-4">
            <Terminal className="w-4 h-4 animate-pulse" />
            <span>sys.init</span>
          </div>
          <div className="text-zinc-300">{SYSTEM_LOGS[logIndex]}</div>
          <div className="w-full bg-zinc-900 h-[2px] mt-2">
            <div
              className="bg-zinc-400 h-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-right text-xs text-zinc-600 mt-1">[{loadingProgress}%]</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-sans antialiased selection:bg-zinc-800 selection:text-zinc-100 pb-12">
      {showInstructions && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0f0f11] border border-zinc-800 p-8 rounded-lg max-w-md w-full relative">
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-zinc-100 font-mono mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-500" />
              instructions.txt
            </h3>
            <div className="space-y-3 text-xs text-zinc-500 font-mono leading-relaxed">
              <p>1. letterboxd: settings &gt; import &amp; export &gt; export your data.</p>
              <p>2. upload diary.csv from the zip file above.</p>
              <p>3. no letterboxd account? enter a manual list below, one film per line:</p>
              <p className="text-zinc-400">Titanic, 1997, 5</p>
            </div>
            <textarea
              value={manualData}
              className="w-full mt-6 bg-zinc-900 border border-zinc-800 rounded-md p-3 text-zinc-300 font-mono text-[10px] min-h-[100px] focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder={"Titanic, 1997, 5\nInception, 2010, 4.5"}
              onChange={(e) => setManualData(e.target.value)}
            />
            <button
              onClick={handleManualEntry}
              className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono py-2.5 rounded-md transition-colors"
            >
              process manual list
            </button>
          </div>
        </div>
      )}

      <header className="px-6 py-4 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-zinc-400 rounded-sm"></div>
            <h1 className="text-lg font-medium tracking-tight text-zinc-100">
              filmetrics
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] bg-zinc-900 px-2 py-1 rounded-sm text-zinc-500 font-mono border border-zinc-800">
              v1.1.0
            </span>
            {wrappedData && (
              <button
                onClick={exportImage}
                title="export as image"
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setShowInstructions(true)}
              title="instructions"
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 md:py-16">
        {!wrappedData ? (
          <div className="max-w-sm mx-auto bg-[#0f0f11] border border-zinc-800/80 rounded-lg p-8 animate-fadeIn">
            <div className="mb-8">
              <h2 className="text-sm font-medium text-zinc-200 mb-1 tracking-tight">initialize dataset</h2>
              <p className="text-xs text-zinc-500 font-mono">
                import diary.csv to proceed, or{' '}
                <button
                  onClick={() => setShowInstructions(true)}
                  className="underline text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  enter a manual list
                </button>
                .
              </p>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-2">username</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="user ID" 
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-2">target_year</label>
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 transition-colors appearance-none"
                >
                  {[2026, 2025, 2024, 2023, 2022].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className={`w-full flex items-center justify-center gap-3 border border-zinc-800 bg-[#09090b] hover:bg-zinc-800/50 rounded-md p-4 cursor-pointer transition-all ${!username ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Upload className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                  <span className="text-xs font-medium text-zinc-300">upload .csv</span>
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={handleFileUpload}
                    disabled={!username}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div ref={dashboardRef} className="space-y-4 md:space-y-6 animate-fadeIn bg-[#09090b] p-1">
            
            <div className="bg-[#0f0f11] p-6 border border-zinc-800/80 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <p className="text-[10px] font-mono text-zinc-500 mb-1">dataset: {wrappedData.year}</p>
                <h2 className="text-2xl font-medium text-zinc-100 tracking-tight">@{wrappedData.username.toLowerCase()}</h2>
              </div>
              <button 
                onClick={() => setWrappedData(null)}
                className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 font-mono px-3 py-1.5 rounded-sm transition-colors"
              >
                [ reset ]
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { label: "total_films", value: wrappedData.totalMovies, icon: <Film className="w-4 h-4" /> },
                { label: "hours_logged", value: Math.round(wrappedData.totalMinutes / 60), icon: <Clock className="w-4 h-4" /> },
                { label: "avg_score", value: wrappedData.averageRating.toFixed(2), icon: <Star className="w-4 h-4" /> },
                { label: "obscurity_idx", value: wrappedData.mainstreamIndex, icon: <Activity className="w-4 h-4" /> }
              ].map((stat, idx) => (
                <div key={idx} className="bg-[#0f0f11] border border-zinc-800/80 p-5 rounded-lg flex flex-col justify-between gap-6">
                  <div className="text-zinc-600">
                    {stat.icon}
                  </div>
                  <div>
                    <span className="block text-2xl font-medium text-zinc-200 tracking-tight">{stat.value}</span>
                    <span className="block text-[10px] font-mono text-zinc-500 mt-1">{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              
              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
                <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2">
                  <span className="w-1 h-1 bg-zinc-500 rounded-full"></span> frequent_directors
                </h3>
                <div className="space-y-4">
                  {wrappedData.topDirectors.map((dir, idx) => {
                    const percentage = (dir.count / wrappedData.topDirectors[0].count) * 100;
                    return (
                      <div key={dir.name} className="space-y-1.5 group">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>{dir.name}</span>
                          <span className="text-zinc-600 font-mono">{dir.count}</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                          <div className={`${LOWKEY_COLORS[idx % LOWKEY_COLORS.length]} h-full rounded-full transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
                <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2">
                  <span className="w-1 h-1 bg-zinc-500 rounded-full"></span> frequent_cast
                </h3>
                <div className="space-y-4">
                  {wrappedData.topActors.map((actor, idx) => {
                    const percentage = (actor.count / wrappedData.topActors[0].count) * 100;
                    return (
                      <div key={actor.name} className="space-y-1.5 group">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>{actor.name}</span>
                          <span className="text-zinc-600 font-mono">{actor.count}</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                          <div className={`${LOWKEY_COLORS[idx % LOWKEY_COLORS.length]} h-full rounded-full transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
                <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2">
                  <span className="w-1 h-1 bg-zinc-500 rounded-full"></span> genre_distribution
                </h3>
                <div className="space-y-4">
                  {wrappedData.topGenres.map((genre, idx) => {
                    const percentage = (genre.count / wrappedData.topGenres[0].count) * 100;
                    return (
                      <div key={genre.name} className="space-y-1.5 group">
                        <div className="flex justify-between text-xs text-zinc-300">
                          <span>{genre.name}</span>
                          <span className="text-zinc-600 font-mono">{genre.count}</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                          <div className={`${LOWKEY_COLORS[idx % LOWKEY_COLORS.length]} h-full rounded-full transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2">
                    <span className="w-1 h-1 bg-zinc-500 rounded-full"></span> temporal_spread
                  </h3>
                  <div className="flex items-end justify-between h-24 pt-2 border-b border-zinc-800">
                    {wrappedData.decades.map((decade) => {
                      const maxCount = Math.max(...wrappedData.decades.map(d => d.count), 1);
                      const height = (decade.count / maxCount) * 100;
                      return (
                        <div key={decade.name} className="flex flex-col items-center justify-end flex-1 group h-full">
                          <span className="text-[9px] text-zinc-500 opacity-0 group-hover:opacity-100 mb-1 transition duration-200">{decade.count}</span>
                          <div className="w-full max-w-[20px] bg-zinc-800 rounded-t-sm transition-all duration-500 group-hover:bg-zinc-500" style={{ height: `${Math.max(height, 5)}%` }} />
                          <span className="text-[9px] font-mono mt-2 text-zinc-600">{decade.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-md flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] font-mono text-zinc-500 mb-1">longest_runtime</span>
                    <span className="text-xs text-zinc-300 truncate max-w-[150px]">{wrappedData.longestFilm.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-zinc-300 font-mono">{wrappedData.longestFilm.runtime}</span>
                    <span className="text-[9px] text-zinc-600 ml-1">min</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
              <h3 className="text-[10px] font-mono text-zinc-500 mb-8 flex items-center gap-2">
                <span className="w-1 h-1 bg-zinc-500 rounded-full"></span> critical_curve
              </h3>
              <div className="flex items-end justify-between h-32 pt-4 px-2">
                {Object.entries(wrappedData.ratingDistribution).map(([rating, count]) => {
                  const counts = Object.values(wrappedData.ratingDistribution);
                  const maxCount = Math.max(...counts, 1);
                  const barHeight = (count / maxCount) * 100; 
                  
                  return (
                    <div key={rating} className="flex flex-col items-center justify-end flex-1 group h-full">
                      <span className="text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 mb-2 transition duration-200 font-mono">
                        {count}
                      </span>
                      <div 
                        className="w-full max-w-[24px] bg-zinc-800/80 rounded-t-sm transition-all duration-1000 ease-out group-hover:bg-zinc-400"
                        style={{ height: `${Math.max(barHeight, 4)}%` }}
                      />
                      <span className="text-[10px] mt-2 border-t border-zinc-800 pt-2 w-full text-center text-zinc-600 font-mono">
                        {rating}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}