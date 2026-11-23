---
title: "Grocerly: The Complete Beginner's Guide"
subtitle: "From zero to a working app on your Android phone. No experience needed."
---

# Read this first

## What you are going to do

You have a finished project called **Grocerly**. It is a website that works like an app on your phone. You point your phone camera at a food packet's barcode, and it shows a health score, ingredients, allergens and better alternatives.

To make it work for real, three things must exist on the internet:

| Piece | What it is (in plain words) | Free service we use |
|---|---|---|
| **The app** | The screens and logic people actually use | **Vercel** (rents you a computer on the internet that runs your app) |
| **The database** | A giant organised notebook where products are remembered | **MongoDB Atlas** (rents you a database) |
| **The code store** | A cloud folder that holds your project so Vercel can read it | **GitHub** |

Think of it like opening a shop. The **code** is your shop's blueprint (GitHub keeps a copy). **Vercel** is the shop building that customers walk into. **MongoDB Atlas** is the storeroom behind the shop. The customer's phone only ever talks to the shop. It never goes into the storeroom directly.

## How long will it take?

| Your experience | Time |
|---|---|
| Never used a terminal or GitHub | 3 to 4 hours (go slowly, take a break after Part 5) |
| Some experience | 1 to 2 hours |

## What it costs

Everything in this guide uses free plans. None of them should ask for a credit card. If any of them does, stop and read the screen carefully before you enter any card details. Free plan rules change over time, so check each website's pricing page if you are unsure.

## What you need before you start

- A **Windows laptop or computer** (Mac users: small differences are marked **Mac**).
- A stable internet connection.
- An **email address** you can open right now (you will receive confirmation emails).
- An **Android phone** with the Chrome app.
- About **3 GB of free disk space**.
- A text file or notebook to jot down passwords. You will create several, and you must not lose them.

## How to use this guide

1. Do the parts **in order**. Do not skip ahead.
2. Each step has a **You should see** line. If what you see matches, carry on. If not, go to Part 11 (Problems).
3. Website screens change over time. If a button's wording is slightly different from this guide, look for the one that means the same thing.
4. Lines in a grey box (like `node -v`) are **commands**. You type or paste them into a terminal. Part 1 explains what that is.

> **Golden rules.** (1) Never share your database password or your `.env.local` file with anyone or post it online. (2) Copy and paste commands instead of retyping them. One wrong letter breaks them. (3) If something fails, read the red text. It usually tells you what is wrong.

# Part 1. Install the tools on your computer (about 30 minutes)

You need three free programs.

| Program | Why you need it |
|---|---|
| **Node.js** | Lets your computer run the project |
| **Git** | Lets you upload the project to GitHub |
| **Visual Studio Code (VS Code)** | A friendly editor for opening the project and typing commands |

## Step 1.1 Install Node.js

1. Open your browser and go to **nodejs.org**.
2. Click the big green button labelled **LTS** ("Long Term Support"). A file downloads.
3. Open the downloaded file (it ends in `.msi` on Windows, `.pkg` on Mac).
4. Click **Next** on every screen and accept the licence. Leave all default options as they are. Click **Install**, then **Finish**. If Windows asks "Do you want to allow this app to make changes?", click **Yes**.

**You should see:** the installer closes with a "completed" message.

## Step 1.2 Install Git

1. Go to **git-scm.com** and click **Download for Windows** (Mac: it may suggest installing through Xcode tools. Say yes).
2. Open the downloaded file.
3. Click **Next** on every screen. Do not change any setting. Click **Install**, then **Finish**.

## Step 1.3 Install VS Code

1. Go to **code.visualstudio.com** and click **Download**.
2. Open the file and install. When you see a screen of checkboxes, tick **Add to PATH** if it is there, then click **Next** and **Install**.

## Step 1.4 Restart your computer

Yes, really. This lets Windows notice the new programs.

## Step 1.5 What is a terminal?

A **terminal** is a window where you type instructions to your computer instead of clicking. Do not be afraid of it. You will only ever paste commands from this guide.

To open one, use VS Code (we will do that in Part 2). For now, to test your installs:

1. Press the **Windows key**, type **cmd**, press **Enter**. A black window opens. This is called **Command Prompt**.
2. Type this exactly and press **Enter**:

```
node -v
```

**You should see:** a version number such as `v22.11.0`. Any number of 18 or higher is fine.

3. Now type:

```
git --version
```

**You should see:** something like `git version 2.45.0`.

If either says "is not recognized", you need to restart the computer (Step 1.4) or reinstall that program.

> **Important for Windows users.** Throughout this guide, use **Command Prompt** (`cmd`) rather than **PowerShell**. PowerShell sometimes refuses to run `npm` and shows a red message about "running scripts is disabled". Command Prompt does not have this problem. In VS Code you can switch: in the terminal panel click the small arrow next to the **+** and choose **Command Prompt**.

**Mac:** press **Cmd + Space**, type **Terminal**, press **Enter**. Everything else is the same.

# Part 2. Open the project (about 10 minutes)

## Step 2.1 Unzip

1. Find the file **grocerly-complete.zip** that you downloaded.
2. Right-click it and choose **Extract All** (Mac: double-click it).
3. Choose a simple place, for example the **Documents** folder. Click **Extract**.

You now have a folder called **grocerly**. Open it. You should see files such as `package.json`, `README.md` and folders such as `app` and `docs`.

> If you see a folder inside a folder (grocerly inside grocerly), use the **inner** one, the one that directly contains `package.json`.

## Step 2.2 Open it in VS Code

1. Open **VS Code**.
2. Click **File**, then **Open Folder**.
3. Select the **grocerly** folder and click **Select Folder**.
4. If VS Code asks "Do you trust the authors?", click **Yes, I trust the authors**.

**You should see:** a list of the project's files on the left.

## Step 2.3 Open the terminal inside VS Code

1. At the top, click **Terminal**, then **New Terminal**.
2. A panel appears at the bottom. If its title says **powershell**, click the small arrow next to **+** and choose **Command Prompt**. Close the old PowerShell tab with the bin icon.

**You should see:** a line ending in `grocerly>`. That tells you the terminal is already inside your project folder. Everything you type goes there.

## Step 2.4 Install the project's building blocks

Paste this and press **Enter**:

```
npm install
```

To paste in the terminal, **right-click** (or press Ctrl + V).

This downloads the libraries the project depends on. It takes 1 to 3 minutes. Lots of text will scroll past. Lines starting with **warn** are normal and harmless.

**You should see:** at the end, a line like `added 250 packages` and the `grocerly>` prompt coming back. A new folder called `node_modules` appears on the left. Leave it alone.

# Part 3. Create your database on MongoDB Atlas (about 30 minutes)

## Step 3.1 Create an account

1. Go to **mongodb.com/atlas** and click **Try Free** (or **Sign Up**).
2. Sign up with your Google account or an email and password. Confirm your email if asked.
3. If it asks a few questions (your goal, experience), answer anything. It does not matter.

## Step 3.2 Create the free database cluster

A **cluster** is just the computer that stores your database.

1. Click **Create** (or **Build a Database**).
2. Choose the **Free** option. It is labelled **M0** and usually shows "FREE" or "$0".
3. For **Provider**, choose **AWS**. For **Region**, choose one near India such as **Mumbai (ap-south-1)**. If Mumbai is not offered for free, pick the nearest one it lets you choose.
4. Name it **grocerly-cluster**.
5. Click **Create Deployment** (or **Create**).

**You should see:** a screen with a spinning wheel while the cluster is built (1 to 3 minutes). Atlas may immediately open a box called **Connect to grocerly-cluster** asking you to create a user. If so, continue to Step 3.3 and use that box.

## Step 3.3 Create the database user

This is the "key" the app uses to enter the database.

1. Find **Database Access** in the left menu (or the user form in the pop-up box).
2. Click **Add New Database User**.
3. Authentication method: **Password**.
4. Username: type **grocerly_app**
5. Password: click **Autogenerate Secure Password**, then click **Copy**.
6. **Immediately paste it in your notebook or text file.** Atlas will not show it again later.

> **Password tip.** If you create your own password instead, use only **letters and numbers** (for example `Mango2026Tree`). Symbols such as `@ : / ? #` break the connection address in Step 3.5.

7. Under **Database User Privileges**, choose **Read and write to any database**.
8. Click **Add User**.

**You should see:** your user `grocerly_app` listed.

## Step 3.4 Allow connections (Network Access)

Atlas blocks everyone by default. You must tell it who may knock on the door.

1. In the left menu, click **Network Access**.
2. Click **Add IP Address**.
3. Click **Allow Access From Anywhere**. The box fills with `0.0.0.0/0`.
4. Click **Confirm**.

**You should see:** a row with `0.0.0.0/0` and the status changing from **Pending** to **Active** after a few seconds.

> **Why "anywhere"?** Vercel (where your app will live) uses many changing addresses, so you cannot list them. Your database is still protected by the username and password and by encryption. For a university project this is acceptable. A company would use stricter settings.

## Step 3.5 Get your connection address

This long text tells the app where the database is and how to log in.

1. In the left menu click **Database** (or **Clusters**).
2. Next to **grocerly-cluster**, click **Connect**.
3. Choose **Drivers**.
4. Make sure **Node.js** is selected.
5. Find the line that starts with `mongodb+srv://`. Click the **copy** icon.

It looks like this:

```
mongodb+srv://grocerly_app:<db_password>@grocerly-cluster.ab1cd.mongodb.net/?retryWrites=true&w=majority
```

6. Paste it into your notebook.
7. Replace the part `<db_password>` (**including the angle brackets < >**) with the password you saved in Step 3.3.

Before: `mongodb+srv://grocerly_app:<db_password>@grocerly-cluster...`
After: `mongodb+srv://grocerly_app:Mango2026Tree@grocerly-cluster...`

**You should see:** an address with no `<` or `>` characters left in it.

# Part 4. Tell the project about your database (about 10 minutes)

The project reads its secret settings from a file called **.env.local**. It does not exist yet. You create it from a template.

## Step 4.1 Create the file

In your VS Code terminal (at the `grocerly>` prompt), paste:

**Windows (Command Prompt):**

```
copy .env.example .env.local
```

**Mac:**

```
cp .env.example .env.local
```

**You should see:** a new file called `.env.local` in the file list on the left. (If you cannot see it, scroll the list, since it is sorted alphabetically.)

## Step 4.2 Fill it in

1. Click `.env.local` in VS Code to open it.
2. Find the line `MONGODB_URI=` and paste your full connection address right after the equals sign. **No spaces, no quote marks.**

It should look like:

```
MONGODB_URI=mongodb+srv://grocerly_app:Mango2026Tree@grocerly-cluster.ab1cd.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=grocerly
```

3. Find the line `OFF_USER_AGENT=` and replace the example email with your own, for example:

```
OFF_USER_AGENT=Grocerly/1.0 (student-project; yourname@gmail.com)
```

(This politely tells the free food database who is asking.)

4. Leave `GEMINI_API_KEY=` empty. That one is optional (see Part 12).
5. Press **Ctrl + S** to save.

> **Never share `.env.local`.** It holds your database password. The project is already set up so this file is **not** uploaded to GitHub.

# Part 5. Run it on your computer and fill it with products (about 20 minutes)

## Step 5.1 Load the ingredient knowledge

In the terminal, paste:

```
npm run seed:kb
```

**You should see:** after a few seconds, a line starting with `Upserted` that mentions ingredients and regulation records.

If you see an error mentioning **authentication** or **ENOTFOUND** or **timed out**, go to Part 11, problems A and B.

## Step 5.2 Load some real products

These commands fetch real product data from Open Food Facts, a free public food database, and save it into your database. Run them one at a time. Each takes 10 to 60 seconds:

```
npm run seed -- maggi
```

```
npm run seed -- lays
```

```
npm run seed -- oreo
```

**You should see:** a list of lines such as `+ inserted 8901058... Maggi Masala Noodles`, ending with `Done. 18 inserted, 0 updated.`

Why several brands? The "better alternatives" feature needs several similar products to compare. The more you load, the better it works. You can try other words too, for example `parle`, `kurkure`, `britannia`, `cornflakes`.

> If it finds nothing, the free service may be busy or your word too narrow. Wait one minute and try again or try a different word.

## Step 5.3 See your data in Atlas (this is the part to show in your viva)

1. Go back to the Atlas website.
2. Click **Database**, then **Browse Collections**.
3. On the left you will see a database called **grocerly** with collections: `products`, `product_analysis`, `ingredients`, `regulations` and others.
4. Click **products**. Each row is one **document**, one product.
5. Click the small arrow beside a document to open it. You will see its name, nutrition and ingredients.

## Step 5.4 Start the app

In the terminal, paste:

```
npm run dev
```

**You should see:** text saying `Ready` and `http://localhost:3000`. The terminal will not give you a prompt back. That is normal. It means the app is running.

1. Open Chrome and go to: **http://localhost:3000/api/health**
2. **You should see:** `{"status":"ok","database":"grocerly","ai":false}`. That means the app can talk to your database.
3. Now go to **http://localhost:3000**. You will see the Grocerly home screen.

## Step 5.5 Try it

- Tap **Search product** and type `maggi`. Tap a result to see the score, nutrition, ingredients, allergens, country status and alternatives.
- Tap **Compare** on a product, then add a second product from search and compare them.
- Tap **Save**, then open the **Saved** tab at the bottom.

(Camera scanning will usually not work on `localhost` from a phone. We test it properly after deploying in Part 9. On your computer's Chrome it may work with a webcam. You can always type a barcode instead.)

To stop the app later, click in the terminal and press **Ctrl + C**.

> **Take a break here.** You have a working app and database. The next parts put it on the internet.

# Part 6. Put your project on GitHub (about 30 minutes)

## Step 6.1 Create a GitHub account

1. Go to **github.com** and click **Sign up**.
2. Follow the steps. Choose a username you are happy to show to teachers and employers.
3. Verify your email.

## Step 6.2 Create an empty repository

A **repository** (or **repo**) is a folder in the cloud.

1. Click the **+** at the top right and choose **New repository**.
2. Repository name: **grocerly**
3. Choose **Private** (only you can see it).
4. **Do not** tick "Add a README", "Add .gitignore" or "Choose a licence". Leave everything else untouched.
5. Click **Create repository**.

**You should see:** a page with a line like `https://github.com/YOURNAME/grocerly.git`. Keep this page open. You need that address.

## Step 6.3 Introduce yourself to Git (one time only)

Stop the running app first if it is still going (click the terminal, press **Ctrl + C**). Then paste these two commands, **one at a time**, replacing the name and email with your own (use the email you used for GitHub):

```
git config --global user.name "Your Name"
```

```
git config --global user.email "you@example.com"
```

Nothing visible happens. That is normal.

## Step 6.4 Upload the project

Paste these commands **one at a time**, pressing Enter after each. Replace `YOURNAME` in the fourth with your GitHub username.

```
git init
```

```
git add .
```

```
git commit -m "Grocerly first version"
```

```
git remote add origin https://github.com/YOURNAME/grocerly.git
```

```
git branch -M main
```

```
git push -u origin main
```

On the last command, a sign-in window may pop up. Choose **Sign in with your browser** and approve it. If it asks for a password in the terminal, GitHub no longer accepts your account password there. Use the browser sign-in option or create a **Personal access token** (GitHub: Settings, Developer settings, Personal access tokens, Generate new token, tick `repo`) and use it as the password.

**You should see:** lines ending in `branch 'main' set up to track 'origin/main'`.

## Step 6.5 Check it worked, and check your secret stayed secret

1. Refresh your GitHub repo page. You should see `app`, `lib`, `docs`, `package.json` and so on.
2. **Make sure there is NO file called `.env.local` in the list.** If there is, your password has leaked. Go to Part 11, problem H immediately.

# Part 7. Put the app on the internet with Vercel (about 30 minutes)

## Step 7.1 Create a Vercel account

1. Go to **vercel.com** and click **Sign Up**.
2. Choose **Continue with GitHub**, and approve.
3. If asked, choose the **Hobby** (free, personal) plan and enter your name.

## Step 7.2 Import your project

1. On the Vercel dashboard click **Add New**, then **Project**.
2. Under **Import Git Repository** find **grocerly** and click **Import**. If you do not see it, click **Adjust GitHub App Permissions**, allow access to the `grocerly` repo, and come back.
3. **Framework Preset** should say **Next.js**. Do not change anything else (Root Directory stays `./`).

## Step 7.3 Add your secret settings (most common place to slip)

Still on this screen, open the **Environment Variables** section. For each row below: type the **Key**, paste the **Value**, click **Add**.

| Key | Value |
|---|---|
| `MONGODB_URI` | the full connection address from Step 3.5 (with your password inside) |
| `MONGODB_DB` | `grocerly` |
| `OFF_USER_AGENT` | `Grocerly/1.0 (student-project; yourname@gmail.com)` |

Check the spelling of each Key carefully, and make sure there are no spaces at the start or end of the Values.

## Step 7.4 Deploy

1. Click **Deploy**.
2. Wait 1 to 3 minutes while a build log scrolls. Confetti means success.
3. Click the preview picture or **Continue to Dashboard**, then **Visit**.

**You should see:** your app, at an address such as `https://grocerly-abc123.vercel.app`.

## Step 7.5 Check the database connection on the live site

Add `/api/health` to the end of your live address, for example `https://grocerly-abc123.vercel.app/api/health`.

**You should see:** `{"status":"ok","database":"grocerly","ai":false}`.

If you see `db_not_configured`, a Key is misspelled or missing. If you see `db_unavailable`, Atlas Network Access (Step 3.4) is not set to Active. Both are fixed in Part 11.

> **If you change any Environment Variable later**, you must **redeploy** for it to take effect: Vercel, your project, **Deployments**, click the three dots on the latest one, **Redeploy**.

# Part 8. Test it on your Android phone (about 20 minutes)

## Step 8.1 Open the app

1. On your phone, open **Chrome**.
2. Type your Vercel address (from Step 7.4). Tip: send the link to yourself on WhatsApp or email and tap it.

**You should see:** the Grocerly home screen, sized for your phone.

## Step 8.2 Scan a barcode

1. Tap **Scan product**.
2. Chrome asks to use the camera. Tap **Allow** (or **While using the app**).
3. Hold the phone 15 to 25 cm from the barcode of a packaged food item. Keep it steady and well lit. Line the barcode up inside the white frame.
4. When it reads the code, your phone vibrates slightly and the product page opens.

**You should see:** the score dial, reasons, nutrition, allergens, ingredients, country status and alternatives.

- If the product is brand-new to your database, it is fetched, scored and **saved automatically**. Check Atlas **Browse Collections** and you will see it appear in `products`.
- If the camera fails, use the **Or type the barcode** box. The digits are printed under the stripes.
- If the free database does not know the product at all, the app offers **Add it from its label** (Step 8.4).

## Step 8.3 Install it like an app

1. In Chrome tap the **three dots** at the top right.
2. Tap **Add to Home screen** (or **Install app**), then **Install**.
3. Find the green **Grocerly** icon on your home screen.

## Step 8.4 Try reading a label photo

1. Tap **Upload label** on the home screen.
2. Tap **Nutrition label** and take a clear, flat, well-lit photo of the nutrition table (or choose one from your gallery). Wait for the percentage to reach 100. The first time is slower because it downloads reading data.
3. The numbers it read appear in boxes. A **yellow box** means "not sure, please check". Compare with the packet and correct anything wrong.
4. Repeat with **Ingredient list**.
5. Type the product name, then tap **Check values and analyse**.

## Step 8.5 Try the cart screenshot

Take a screenshot of a shopping cart from any online grocery app, open **Analyze cart**, and choose the screenshot. You get an average score and a per-item list. Product names need to be readable and match items in the free database, so expect some "no match" lines.

# Part 9. Your final checklist

Tick each one:

- [ ] `/api/health` shows `ok` on the live address
- [ ] Scanning a real packet shows a result on your phone
- [ ] That product now appears in Atlas, inside `products`
- [ ] Scanning it again does not create a second copy
- [ ] Compare works with two products
- [ ] Saved and History tabs show your items
- [ ] A label photo produced numbers, with yellow boxes on the uncertain ones
- [ ] `.env.local` is **not** on GitHub

# Part 10. Explaining it in your viva (the 60-second version)

> "Grocerly is a web app that works like an Android app. When a user scans a barcode, the phone sends it to my server on Vercel. My server first looks for the product in my MongoDB Atlas database. If it is not there, it asks Open Food Facts, converts the data into my own format, checks it, calculates a score using fixed rules, and saves it into MongoDB using an upsert, so the same product is never stored twice. Next time it comes straight from my database. The phone never talks to the database directly, which keeps the password safe. I chose MongoDB because food data varies a lot: some products list six nutrients, some fourteen, and each has a list of ingredients. Documents hold that naturally without forcing a fixed table. The score is not generated by AI. It is calculated by rules I can explain point by point."

For more questions and model answers, read `docs/NO_SQL_VIVA.md` in the project.

# Part 11. Problems and fixes in plain words

**A. "Authentication failed" or "bad auth"**
The username or password in your connection address is wrong. Reopen your notebook, check the password. In Atlas go to **Database Access**, click **Edit** next to `grocerly_app`, **Edit Password**, set a new letters-and-numbers password, and fix `.env.local` (and the Vercel variable) to match.

**B. "ENOTFOUND", "timed out" or "server selection" errors**
Atlas is not letting you in or the address is mistyped. Check **Network Access** shows `0.0.0.0/0` as **Active**. Check there is no space or quote mark in `MONGODB_URI`. Check your internet.

**C. "npm is not recognized" or "node is not recognized"**
Node.js is not installed properly. Restart the computer. If it still fails, reinstall Node.js from nodejs.org.

**D. PowerShell says "running scripts is disabled on this system"**
Open a **Command Prompt** terminal instead (Step 1.5).

**E. `npm install` shows red "ERR!" lines**
Check your internet and run it again. Make sure the terminal says `grocerly>` and that you are in the folder that contains `package.json`.

**F. `/api/health` says `db_not_configured`**
The app cannot find `MONGODB_URI`. Locally, confirm the file is named exactly `.env.local` (not `.env.local.txt`) and sits next to `package.json`, then stop and restart `npm run dev`. On Vercel, check Environment Variables and redeploy.

**G. Seeding finds nothing**
The free food database may be busy or rate-limiting. Wait a couple of minutes and try another search word.

**H. `.env.local` appeared on GitHub**
Your password is exposed. Do this immediately: (1) In Atlas, change the database user's password (Problem A). (2) Delete the GitHub repository (Settings, scroll to the bottom, **Delete this repository**). (3) Make sure `.gitignore` in your project contains the line `.env.local` (it should already). (4) Create a new repository and push again (Part 6).

**I. `git push` asks for a password and refuses**
Use the browser sign-in option, or a Personal access token (Step 6.4).

**J. The camera does not start**
Use the **https://** Vercel link in **Chrome**. Do not use the link from inside WhatsApp or Instagram's built-in browser. Tap the padlock next to the address, choose **Permissions**, and allow **Camera**. Reload.

**K. The barcode will not scan**
Move to better light, remove glare, hold steady at 15 to 25 cm, or type the digits.

**L. "Product not found"**
Open Food Facts does not have every Indian product. Use **Add it from its label**. Your database will remember it afterwards.

**M. Label reading gives wrong numbers**
Take the photo flat, bright and close, with the table filling the frame. Always correct the yellow-highlighted boxes by hand before saving.

**N. Vercel build failed**
Click the failed deployment, read the last red lines of the log. The most common cause is a mistyped Environment Variable name. Fix it and redeploy.

**O. The live site worked yesterday, now shows an error**
Open Atlas. Free clusters can be **paused** after inactivity. Click **Resume** on the cluster, wait two minutes, and retry.

# Part 12. Optional extras

## Turn on AI ingredient explanations (optional)

1. Create a Gemini API key at **aistudio.google.com** (sign in, click **Get API key**).
2. Put it in `.env.local` after `GEMINI_API_KEY=` and add it to Vercel as a new Environment Variable with the same name, then redeploy.
3. Unfamiliar ingredients now get a short "AI note". These notes never change the score.

## Make an Android app file (APK)

This is optional and more technical. The project documentation (`docs/DEPLOYMENT_GUIDE.md`, section 8) describes using Capacitor to wrap your Vercel website in an Android app. The website version already behaves like an app once you "Add to Home screen".

# Part 13. Honest limits you should mention

- The country "allowed / restricted / banned" information covers only a few ingredients and is marked **not independently verified**. Everything else says **Unknown**. This is deliberate: the app never guesses "allowed".
- Not every Indian product exists in the free food database. The label photo option fills the gap.
- Label reading is imperfect, so values must be checked by a human.
- Health scores are a comparison aid, not medical advice.
- History and saved items belong to your phone's browser, since there is no login system.

# Glossary (words you will hear)

| Word | Meaning |
|---|---|
| **Terminal / Command Prompt** | A window where you type instructions |
| **Command** | One instruction typed in a terminal |
| **Node.js** | The engine that runs the project's code |
| **npm** | The tool that downloads the project's building blocks |
| **Repository (repo)** | A project folder stored on GitHub |
| **Commit** | A saved snapshot of your project |
| **Push** | Upload your snapshot to GitHub |
| **Deploy** | Put the app on the internet |
| **Vercel** | The service that hosts your app |
| **MongoDB** | The type of database used (stores flexible "documents") |
| **Atlas** | The company service that hosts your MongoDB for free |
| **Cluster** | The computer(s) that hold your database |
| **Database** | The whole container (`grocerly`) |
| **Collection** | A group of similar items inside it (like `products`) |
| **Document** | One item in a collection (one product) |
| **Field** | One piece of information in a document (like `name`) |
| **Index** | A shortcut that makes searching fast |
| **Upsert** | "Update it if it exists, create it if it doesn't": no duplicates |
| **Aggregation** | Combining data from several collections in one query |
| **API** | The doorway the app uses to ask the server for things |
| **Environment variable** | A secret setting kept outside the code (like a password) |
| **HTTPS** | The secure "https://" web address. Needed for the camera |
| **PWA** | A website that can be installed and behaves like an app |
| **OCR** | Software that reads text from a photo |
| **Barcode** | The stripes and digits that identify a product |
| **Open Food Facts** | A free public database of food products |
| **Localhost** | Your own computer pretending to be a website server |
