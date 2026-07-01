# Filmetrics

A minimalist, utilitarian dashboard for visualizing and analyzing your Letterboxd viewing history. Built with Next.js and the TMDB API, Filmetrics transforms your raw CSV data into an interactive, data-driven cinematic profile.

## Features

- **CSV & Manual Import**: Upload your exported Letterboxd `diary.csv` or manually input your watchlist.
- **Interactive Filtering**: Click on any director, actor, or genre to instantly filter the dashboard and view the specific films associated with that entity.
- **Deep Analytics**: 
  - Core metrics (Total films, hours logged, average score, obscurity index).
  - Frequent directors and cast members.
  - Genre distribution and temporal spread (decades).
  - Critical curve (rating distribution).
- **Image Export**: Generate and download a high-resolution PNG of your dashboard to share on social media.
- **Minimalist UI**: Clean, dark-mode-first design with custom scrollbars and subtle animations.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Data Parsing**: [PapaParse](https://www.papaparse.com/)
- **Image Generation**: [html-to-image](https://github.com/bubkoo/html-to-image)
- **API**: [TMDB API](https://developer.themoviedb.org/docs) (for metadata, genres, and credits)

## Getting Started

### Prerequisites

- Node.js 18+ 
- A [TMDB API Key](https://developer.themoviedb.org/docs/getting-started)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/alb80degrees/filmetrics.git
   cd filmetrics