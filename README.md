This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Configuration

Create `.env.local` at project root:

```
DEEPSEEK_API_KEY=your_deepseek_key
REDIS_HOST=xxxx
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=xxxx
REDIS_CHANNEL=message_channel
```

## API

- `POST /api/chat/send`: body `{ text: string }` → generates answer with DeepSeek and publishes `{"message": "..."}` (UTF-8 bytes) to Redis channel.

## UI

- Top: WHEP player (input URL → Play/Stop), 9:16 container.
- Bottom: chat input only (no history), posts to `/api/chat/send`.
