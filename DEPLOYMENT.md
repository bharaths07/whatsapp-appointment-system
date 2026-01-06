# Deployment Guide for WhatsApp Appointment System

## Database Migration

1. **Supabase Setup:**

   - Create a new project at https://supabase.com
   - Go to SQL Editor and run the `create_table.sql` script from backend/
   - Copy the connection string from Settings > Database and update DB_URL in .env

2. **Railway Setup:**
   - Create a PostgreSQL database at https://railway.app
   - Get the DATABASE_URL and update DB_URL in .env
   - Run the create_table.sql script in the database

## Backend Deployment (Render)

1. Create a new Web Service at https://render.com
2. Connect your GitHub repo
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add environment variables: DB_URL, META_ACCESS_TOKEN, VERIFY_TOKEN, PHONE_NUMBER_ID
6. Deploy

## Frontend Deployment (Vercel)

1. Create a new project at https://vercel.com
2. Connect your GitHub repo (frontend folder)
3. Set build command: `npm run build`
4. Deploy

## Meta Developer Dashboard

1. Go to https://developers.facebook.com/apps
2. Select your WhatsApp app
3. Go to WhatsApp > Setup > Webhooks
4. Update the Callback URL to your deployed backend URL + /webhook
5. Verify the webhook with your VERIFY_TOKEN

## Additional Notes

- For local testing, use ngrok: `ngrok http 3000` and use the ngrok URL as webhook URL temporarily
- Ensure all environment variables are set correctly
- Test the webhook verification and message sending
