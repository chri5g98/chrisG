# Who's Up for Padel?

A shared calendar for organising padel over WhatsApp. Post the link in the group; everyone adds their name once and taps the hours they're free. Any hour with 4 or more people turns into a ball, and "Send to WhatsApp" posts the line-up back to the chat.

It lives at `/padel/` on this repo's GitHub Pages site. It's a plain HTML page, separate from the FMAREA app.

## Turning on the shared calendar (one-off, about 5 minutes)

Until this is done the page runs in practice mode and only saves on your own phone.

1. Go to https://console.firebase.google.com and sign in with a Google account.
2. **Create a project** (any name, e.g. `padel`). You can turn Google Analytics off.
3. In the left menu: **Build → Realtime Database → Create database**. Pick a location near you (e.g. Belgium `europe-west1`) and choose **Start in locked mode**.
4. Open the **Rules** tab, replace everything with the rules below and press **Publish**:

   ```json
   {
     "rules": {
       "padel": {
         "$group": {
           ".read": true,
           ".write": true
         }
       }
     }
   }
   ```

5. On the **Data** tab, copy the database URL at the top (it looks like `https://padel-xxxx-default-rtdb.europe-west1.firebasedatabase.app`).
6. Paste it into `public/padel/config.js` as `databaseURL`.

Anyone with the link can add names and tick hours, which is the point. There are no passwords, so don't put anything private in it.

## Separate groups

Add a name after `#` to keep a different calendar, e.g. `.../padel/#tuesday-crew`. Without one, everyone shares the default calendar.
