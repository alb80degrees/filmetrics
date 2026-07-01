# Filmetrics

A minimalist, utilitarian dashboard for visualizing and analyzing your Letterboxd viewing history. Built with Next.js and the TMDB API, Filmetrics transforms your raw CSV data into an interactive, data-driven cinematic profile.

## Features
- **CSV & Manual Import**: Upload your exported Letterboxd `diary.csv` or manually input your watchlist.
- **Interactive Filtering**: Click on any director, actor, or genre to instantly filter the dashboard and view the specific films associated with that entity.
- **Deep Analytics**: Core metrics, frequent directors/cast, genre distribution, temporal spread, and critical curve.
- **Image Export**: Generate and download a high-resolution PNG of your dashboard.

## Tech Stack
- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Data Parsing**: PapaParse
- **Image Generation**: html-to-image
- **API**: TMDB API

## Getting Started
1. Clone the repository and install dependencies: `npm install`
2. Create a `.env.local` file in the root and add your TMDB API key: `NEXT_PUBLIC_TMDB_API_KEY=your_key_here`
3. Run the development server: `npm run dev`