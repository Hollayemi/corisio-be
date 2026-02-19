# Go-Kart Backend (Node.js + TypeScript + MongoDB)

Go-Kart is a backend service for a grocery e-commerce platform where users can order groceries and have them delivered by verified riders.  
The admin can register and manage riders, and the platform supports real-time order tracking, in-app calling, and other essential e-commerce features.

---

## 🚀 Features

### 🛒 E-commerce Core
- Product listing & categorization  
- Cart & checkout  
- Order creation & management  
- Payment integration

### 🚴 Rider & Delivery System
- Admin-managed rider registration  
- Rider login & authentication  
- Real-time order tracking  
- Delivery workflow (Picked - Enroute - Delivered)  
- Rider-to-user in-app call support  

### 🔐 Security
- JWT authentication  
- Role-based access (Admin, Rider, User)  
- Request validation  
- Secured environment config

### 🛠 Developer Experience
- TypeScript - standard experience
- Layered and scalable folder structure  
- Reusable services  (fmc, payment, email, notifications, etc)
- ESLint & Prettier 

---

## 📁 Project Structure

```

src/
│── config/        # Database config, environment variables
│── controllers/   # Route handlers
│── helpers/       # Utility functions
│── middleware/    # Auth, role-guard, validation
│── models/        # Database models
│── routes/        # API route definitions
│── services/      # Core business logic
│── types/         # TypeScript type definitions
│── utils/         # Common utilities
│── server.ts      # Application entry point

````

---

## 🧰 Tech Stack

- Node.js  
- Express  
- TypeScript  
- MongoDB
- Mongoose  
- Socket.io (real-time updates & calling)  
- JWT + bcrypt  

---

## 🔧 Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/go-kart-backend.git
cd go-kart-backend
````

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment variables

Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

Fill in your database credentials, JWT secret, and other configs.

### 4. Run development server

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

### 6. Start production server

```bash
npm start
```

---

## 🌐 API Documentation

You may use Swagger, Postman, or ReDoc.

```
API Docs: coming...
```

---

## 🧪 Testing

If testing is implemented:

```bash
npm run test
```

---

## 🚀 Deployment

Go-Kart can be deployed on platforms like:

* Render
* Railway
* AWS EC2
* Heroku
* Vercel (serverless with adjustments)

Make sure to update environment variables in production.

---

## 👨‍💻 Developer

**Stephen Oluwasusi**
Backend Developer • TypeScript • Node.js • NextJS • Reactjs (_enterprise apps_)

Project: **Go-Kart Grocery Delivery System**

---

## 📜 License
