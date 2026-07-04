'use client';

import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { toPng } from 'html-to-image';
import { Film, Clock, Star, BarChart, Upload, Users, Hourglass, Activity, Terminal, HelpCircle, X, Camera, RefreshCw } from 'lucide-react';

interface LetterboxdRow {
  Date: string;
  Name: string;
  Year: string;
  Rating: string;
  'Watched Date'?: string;
}

interface EnrichedMovie {
  name: string;
  year: number;
  dateWatched: string;
  rating: number | null;
  genres: string[];
  director: string;
  actors: string[];
  runtime: number;
  popularity: number;
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
  allMovies: EnrichedMovie[];
}

const TMDB_GENRES: Record<number, string> = {
  28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
  99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 36: 'history',
  27: 'horror', 10402: 'music', 9648: 'mystery', 10749: 'romance', 878: 'sci-fi',
  10770: 'tv movie', 53: 'thriller', 10752: 'war', 37: 'western'
};

const LOWKEY_COLORS = ['bg-zinc-300', 'bg-zinc-400', 'bg-zinc-500', 'bg-zinc-600', 'bg-zinc-700'];

const SYSTEM_LOGS = [
  "> reading csv...",
  "> fetching metadata from tmdb...",
  "> parsing genres...",
  "> calculating aggregates...",
  "> mapping data relationships...",
  "> rendering ui..."
];

export default function Filmetrics() {
  const [username, setUsername] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const [wrappedData, setWrappedData] = useState<WrappedData | null>(null);
  
  // Modal states
  const [showInstructions, setShowInstructions] = useState(false);
  const [manualData, setManualData] = useState('');
  const [activeDetail, setActiveDetail] = useState<{ title: string; movies: EnrichedMovie[] } | null>(null);
  
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => setLogIndex((prev) => (prev + 1) % SYSTEM_LOGS.length), 1500);
      return () => clearInterval(interval);
    }
  }, [loading]);

  const exportImage = () => {
    if (dashboardRef.current) {
      toPng(dashboardRef.current, { backgroundColor: '#09090b' })
        .then((dataUrl) => {
          const link = document.createElement('a');
          link.download = `filmetrics-${selectedYear}.png`;
          link.href = dataUrl;
          link.click();
        });
    }
  };

  const handleManualEntry = () => {
    const rows = manualData.split('\n').filter(l => l.trim()).map(line => {
      const [Name, Year, Rating] = line.split(',');
      return { Date: new Date().toISOString().split('T')[0], Name: Name?.trim(), Year: Year?.trim(), Rating: Rating?.trim() };
    });
    if (rows.length > 0) {
      setShowInstructions(false);
      processLetterboxdData(rows as LetterboxdRow[]);
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
    const processedMovies: EnrichedMovie[] = [];

    for (let i = 0; i < filteredData.length; i++) {
      const row = filteredData[i];
      const dateWatched = (row['Watched Date'] || row.Date).split(' ')[0];
      
      let ratingVal: number | null = null;
      if (row.Rating) {
        ratingVal = parseFloat(row.Rating);
        if (!isNaN(ratingVal)) {
          totalRating += ratingVal;
          ratedCount++;
          const rStr = ratingVal.toFixed(1);
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
          const searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(row.Name)}&year=${row.Year}&api_key=${tmdbKey}`);
          const searchData = await searchRes.json();

          if (searchData.results && searchData.results.length > 0) {
            const firstResult = searchData.results[0];
            const tmdbId = firstResult.id;
            const popularity = firstResult.popularity || 0;
            const genres = (firstResult.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean);

            const detailRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=credits&api_key=${tmdbKey}`);
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

      processedMovies.push({
        name: row.Name.toLowerCase(),
        year: releaseYear,
        dateWatched,
        rating: ratingVal,
        genres: movieDetails.genres,
        director: movieDetails.director,
        actors: movieDetails.actors,
        runtime: movieDetails.runtime,
        popularity: movieDetails.popularity
      });

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
      ratingDistribution: ratingDist,
      allMovies: processedMovies
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
            <div className="bg-zinc-400 h-full transition-all duration-300 ease-out" style={{ width: `${loadingProgress}%` }} />
          </div>
          <div className="text-right text-xs text-zinc-600 mt-1">[{loadingProgress}%]</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 font-sans antialiased selection:bg-zinc-800 selection:text-zinc-100 pb-12">
      
      {/* Detail Overlay Modal */}
      {activeDetail && (
        <div 
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setActiveDetail(null)}
        >
          <div 
            className="bg-[#09090b] border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-zinc-800/80 bg-[#0f0f11] rounded-t-lg">
              <h3 className="text-zinc-300 font-mono text-xs flex items-center gap-2">
                <Terminal className="w-3 h-3 text-zinc-500" /> {activeDetail.title}
              </h3>
              <button onClick={() => setActiveDetail(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-1">
              <div className="flex justify-between text-[9px] font-mono text-zinc-600 mb-2 px-2 uppercase tracking-widest">
                <span>film</span>
                <span className="text-right">metrics</span>
              </div>
              {activeDetail.movies.map((m, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-mono text-zinc-400 hover:bg-zinc-800/30 p-2 rounded transition-colors">
                  <span className="text-zinc-200 truncate pr-4">{m.name} <span className="text-zinc-600">({m.year})</span></span>
                  <span className="flex items-center gap-3 shrink-0">
                     {m.rating ? <span className="text-zinc-300">{m.rating.toFixed(1)} ★</span> : <span className="text-zinc-600">-.- ★</span>}
                     <span className="text-zinc-500 hidden sm:inline w-10 text-right">{m.runtime}m</span>
                     <span className="text-zinc-600 w-20 text-right">{m.dateWatched}</span>
                  </span>
                </div>
              ))}
              {activeDetail.movies.length === 0 && (
                <div className="text-zinc-600 font-mono text-xs p-2">no records match this query.</div>
              )}
            </div>
          </div>
        </div>
      )}

{/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setShowInstructions(false)}>
          <div className="bg-[#0f0f11] border border-zinc-800 p-8 rounded-lg max-w-md w-full relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowInstructions(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X className="w-4 h-4"/></button>
            <h3 className="text-zinc-100 font-mono mb-6 flex items-center gap-2"><Terminal className="w-4 h-4"/> instructions.txt</h3>
            
            <div className="space-y-3 text-[11px] text-zinc-500 font-mono leading-relaxed">
              <p className="text-zinc-300 font-semibold mb-2">getting your letterboxd data:</p>
              <p>1. log into letterboxd.com on a browser.</p>
              <p>2. go to <span className="text-zinc-300">settings</span> (top right menu).</p>
              <p>3. click the <span className="text-zinc-300">import & export</span> tab.</p>
              <p>4. click <span className="text-zinc-300">export your data</span>.</p>
              <p>5. extract the zip and upload <span className="text-zinc-300">diary.csv</span>.</p>
              
              <div className="pt-4 mt-4 border-t border-zinc-800">
                <p className="text-zinc-300 font-semibold mb-2">no letterboxd account?</p>
                <p>paste a manual list below using the exact format: <br/><i>Name, Year, Rating</i>.</p>
              </div>
            </div>

            <textarea 
              className="w-full mt-4 bg-zinc-900 border border-zinc-800 p-3 rounded text-zinc-300 font-mono text-[10px] h-28 focus:outline-none focus:border-zinc-600"
              placeholder="Goodfellas, 1990, 5&#10;Dune, 2021, 4.5"
              onChange={(e) => setManualData(e.target.value)}
            />
            <button onClick={handleManualEntry} className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs py-3 rounded font-mono transition-colors">
              process manual list
            </button>
          </div>
        </div>
      )}

      {/* minimalist navbar */}
      <header className="px-6 py-4 border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-zinc-400 rounded-sm"></div>
            <h1 className="text-lg font-medium tracking-tight text-zinc-100">filmetrics</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] bg-zinc-900 px-2 py-1 rounded-sm text-zinc-500 font-mono border border-zinc-800 hidden sm:inline-block">v1.1.0</span>
            {wrappedData && (
              <>
                <button onClick={() => setWrappedData(null)} title="New Query" className="text-zinc-500 hover:text-zinc-200 transition-colors"><RefreshCw className="w-4 h-4"/></button>
                <button onClick={exportImage} title="Export as PNG" className="text-zinc-500 hover:text-zinc-200 transition-colors"><Camera className="w-4 h-4"/></button>
              </>
            )}
            <button onClick={() => setShowInstructions(true)} title="Help" className="text-zinc-500 hover:text-zinc-200 transition-colors"><HelpCircle className="w-4 h-4"/></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {!wrappedData ? (
          /* input block */
          <div className="max-w-sm mx-auto bg-[#0f0f11] border border-zinc-800/80 rounded-lg p-8 animate-fadeIn mt-10">
            <div className="mb-8">
              <h2 className="text-sm font-medium text-zinc-200 mb-1 tracking-tight">initialize dataset</h2>
              <p className="text-xs text-zinc-500 font-mono">import diary.csv to proceed.</p>
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
                  {[2026, 2025, 2024, 2023, 2022].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="pt-2">
                <label className={`w-full flex items-center justify-center gap-3 border border-zinc-800 bg-[#09090b] hover:bg-zinc-800/50 rounded-md p-4 cursor-pointer transition-all ${!username ? 'opacity-40 pointer-events-none' : ''}`}>
                  <Upload className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                  <span className="text-xs font-medium text-zinc-300">upload .csv</span>
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={!username} />
                </label>
              </div>
            </div>
          </div>
        ) : (
          /* data dashboard */
          <div ref={dashboardRef} className="space-y-4 md:space-y-6 animate-fadeIn bg-[#09090b] p-2 md:p-6 rounded-xl">
            
            {/* user header */}
            <div className="bg-[#0f0f11] p-6 border border-zinc-800/80 rounded-lg">
              <p className="text-[10px] font-mono text-zinc-500 mb-1">dataset: {wrappedData.year}</p>
              <h2 className="text-2xl font-medium text-zinc-100 tracking-tight">@{wrappedData.username.toLowerCase()}</h2>
            </div>

            {/* core metrics - interactive */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { label: "total_films", value: wrappedData.totalMovies, icon: <Film className="w-4 h-4" />, action: () => setActiveDetail({ title: '> query: all_films', movies: [...wrappedData.allMovies].sort((a,b) => new Date(b.dateWatched).getTime() - new Date(a.dateWatched).getTime()) }) },
                { label: "hours_logged", value: Math.round(wrappedData.totalMinutes / 60), icon: <Clock className="w-4 h-4" />, action: () => setActiveDetail({ title: '> query: sort_by_runtime', movies: [...wrappedData.allMovies].sort((a,b) => b.runtime - a.runtime) }) },
                { label: "avg_score", value: wrappedData.averageRating.toFixed(2), icon: <Star className="w-4 h-4" />, action: () => setActiveDetail({ title: '> query: highest_rated', movies: [...wrappedData.allMovies].filter(m => m.rating).sort((a,b) => b.rating! - a.rating!) }) },
                { label: "obscurity_idx", value: wrappedData.mainstreamIndex, icon: <Activity className="w-4 h-4" />, action: () => setActiveDetail({ title: '> query: top_10_most_obscure', movies: [...wrappedData.allMovies].sort((a,b) => a.popularity - b.popularity).slice(0, 10) }) }
              ].map((stat, idx) => (
                <div 
                  key={idx} 
                  onClick={stat.action}
                  className="bg-[#0f0f11] border border-zinc-800/80 p-5 rounded-lg flex flex-col justify-between gap-6 cursor-pointer hover:bg-zinc-900 transition-colors group"
                >
                  <div className="text-zinc-600 group-hover:text-zinc-400 transition-colors">{stat.icon}</div>
                  <div>
                    <span className="block text-2xl font-medium text-zinc-200 tracking-tight group-hover:text-white transition-colors">{stat.value}</span>
                    <span className="block text-[10px] font-mono text-zinc-500 mt-1">{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* split grid for analytics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              
              {/* directors */}
              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
                <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2"><span className="w-1 h-1 bg-zinc-500 rounded-full"></span> frequent_directors</h3>
                <div className="space-y-4">
                  {wrappedData.topDirectors.map((dir, idx) => {
                    const percentage = (dir.count / wrappedData.topDirectors[0].count) * 100;
                    return (
                      <div 
                        key={dir.name} 
                        className="space-y-1.5 group cursor-pointer hover:bg-zinc-800/30 p-1.5 -mx-1.5 rounded transition-colors"
                        onClick={() => setActiveDetail({ title: `> query: director == '${dir.name}'`, movies: wrappedData.allMovies.filter(m => m.director === dir.name).sort((a,b) => new Date(b.dateWatched).getTime() - new Date(a.dateWatched).getTime()) })}
                      >
                        <div className="flex justify-between text-xs text-zinc-300 group-hover:text-zinc-100">
                          <span>{dir.name}</span><span className="text-zinc-600 font-mono">{dir.count}</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                          <div className={`${LOWKEY_COLORS[idx % LOWKEY_COLORS.length]} h-full rounded-full`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* cast */}
              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
                <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2"><span className="w-1 h-1 bg-zinc-500 rounded-full"></span> frequent_cast</h3>
                <div className="space-y-4">
                  {wrappedData.topActors.map((actor, idx) => {
                    const percentage = (actor.count / wrappedData.topActors[0].count) * 100;
                    return (
                      <div 
                        key={actor.name} 
                        className="space-y-1.5 group cursor-pointer hover:bg-zinc-800/30 p-1.5 -mx-1.5 rounded transition-colors"
                        onClick={() => setActiveDetail({ title: `> query: cast_includes == '${actor.name}'`, movies: wrappedData.allMovies.filter(m => m.actors.includes(actor.name)).sort((a,b) => new Date(b.dateWatched).getTime() - new Date(a.dateWatched).getTime()) })}
                      >
                        <div className="flex justify-between text-xs text-zinc-300 group-hover:text-zinc-100">
                          <span>{actor.name}</span><span className="text-zinc-600 font-mono">{actor.count}</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                          <div className={`${LOWKEY_COLORS[idx % LOWKEY_COLORS.length]} h-full rounded-full`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* genres */}
              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
                <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2"><span className="w-1 h-1 bg-zinc-500 rounded-full"></span> genre_distribution</h3>
                <div className="space-y-4">
                  {wrappedData.topGenres.map((genre, idx) => {
                    const percentage = (genre.count / wrappedData.topGenres[0].count) * 100;
                    return (
                      <div 
                        key={genre.name} 
                        className="space-y-1.5 group cursor-pointer hover:bg-zinc-800/30 p-1.5 -mx-1.5 rounded transition-colors"
                        onClick={() => setActiveDetail({ title: `> query: genre == '${genre.name}'`, movies: wrappedData.allMovies.filter(m => m.genres.includes(genre.name)).sort((a,b) => new Date(b.dateWatched).getTime() - new Date(a.dateWatched).getTime()) })}
                      >
                        <div className="flex justify-between text-xs text-zinc-300 group-hover:text-zinc-100">
                          <span>{genre.name}</span><span className="text-zinc-600 font-mono">{genre.count}</span>
                        </div>
                        <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                          <div className={`${LOWKEY_COLORS[idx % LOWKEY_COLORS.length]} h-full rounded-full`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* decades & longest */}
              <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg flex flex-col justify-between gap-6">
                <div>
                  <h3 className="text-[10px] font-mono text-zinc-500 mb-6 flex items-center gap-2"><span className="w-1 h-1 bg-zinc-500 rounded-full"></span> temporal_spread</h3>
                  <div className="flex items-end justify-between h-24 pt-2 border-b border-zinc-800">
                    {wrappedData.decades.map((decade) => {
                      const maxCount = Math.max(...wrappedData.decades.map(d => d.count), 1);
                      const height = (decade.count / maxCount) * 100;
                      return (
                        <div 
                          key={decade.name} 
                          className="flex flex-col items-center justify-end flex-1 group h-full cursor-pointer"
                          onClick={() => setActiveDetail({ title: `> query: decade == ${decade.name}`, movies: wrappedData.allMovies.filter(m => Math.floor(m.year / 10) * 10 === parseInt(decade.name.replace('s',''))).sort((a,b) => new Date(b.dateWatched).getTime() - new Date(a.dateWatched).getTime()) })}
                        >
                           <span className="text-[9px] text-zinc-500 opacity-0 group-hover:opacity-100 mb-1 transition duration-200">{decade.count}</span>
                           <div className="w-full max-w-[20px] bg-zinc-800 rounded-t-sm transition-all duration-300 group-hover:bg-zinc-500" style={{ height: `${Math.max(height, 5)}%` }} />
                           <span className="text-[9px] font-mono mt-2 text-zinc-600 group-hover:text-zinc-300">{decade.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

<div 
                  className="bg-zinc-900/50 border border-zinc-800/50 p-4 rounded-md flex items-center justify-between cursor-pointer hover:bg-zinc-800 transition-colors"
                  onClick={() => setActiveDetail({ 
                    title: `> query: top_10_longest_runtimes`, 
                    movies: [...wrappedData.allMovies].sort((a, b) => b.runtime - a.runtime).slice(0, 10) 
                  })}
                >
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

            {/* rating curve */}
            <div className="bg-[#0f0f11] border border-zinc-800/80 p-6 rounded-lg">
              <h3 className="text-[10px] font-mono text-zinc-500 mb-8 flex items-center gap-2"><span className="w-1 h-1 bg-zinc-500 rounded-full"></span> critical_curve</h3>
              <div className="flex items-end justify-between h-32 pt-4 px-2">
                {Object.entries(wrappedData.ratingDistribution).map(([rating, count]) => {
                  const counts = Object.values(wrappedData.ratingDistribution);
                  const maxCount = Math.max(...counts, 1);
                  const barHeight = (count / maxCount) * 100; 
                  
                  return (
                    <div 
                      key={rating} 
                      className="flex flex-col items-center justify-end flex-1 group h-full cursor-pointer"
                      onClick={() => setActiveDetail({ title: `> query: rating == ${rating}`, movies: wrappedData.allMovies.filter(m => m.rating === parseFloat(rating)).sort((a,b) => new Date(b.dateWatched).getTime() - new Date(a.dateWatched).getTime()) })}
                    >
                      <span className="text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 mb-2 transition duration-200 font-mono">{count}</span>
                      <div className="w-full max-w-[24px] bg-zinc-800/80 rounded-t-sm transition-all duration-300 group-hover:bg-zinc-400" style={{ height: `${Math.max(barHeight, 4)}%` }} />
                      <span className="text-[10px] mt-2 border-t border-zinc-800 pt-2 w-full text-center text-zinc-600 font-mono group-hover:text-zinc-300">{rating}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* lowkey footer */}
      <footer className="pb-8 text-center">
        <span className="text-[10px] font-mono text-zinc-700 hover:text-zinc-500 transition-colors cursor-default">
          alvin©
        </span>
      </footer>

    </div>
  );
}