# Order Management System

A mobile-first web application for managing custom orders with React frontend and Node.js/SQLite backend.

## 🚀 Features

### Admin Dashboard
- Create and manage business tenants
- Design custom order forms with drag-and-drop fields
- Publish forms and generate unique links
- Monitor all orders across tenants
- User management

### Business Owner Portal
- Manage custom order forms
- Share form links via WhatsApp
- View and confirm customer orders
- Track order status (Pending → Confirmed → Dispatched)
- Order analytics and reporting

### Client Order Form
- Mobile-first responsive design
- Dynamic form fields based on business requirements
- Image upload for dress designs
- Payment receipt upload
- Real-time form validation

### Stock Keeper Portal
- View confirmed orders ready for dispatch
- Update order status to dispatched
- Filter orders by status
- Detailed order information with images

## 🛠 Tech Stack

**Frontend:**
- React 18 with Vite
- TailwindCSS for styling
- React Router for navigation
- React Hook Form for form handling
- Axios for API calls
- React Hot Toast for notifications

**Backend:**
- Node.js with Express
- SQLite database with Prisma ORM
- JWT authentication
- Multer for file uploads
- bcryptjs for password hashing

## 📦 Installation

### Quick Setup (Windows)
```bash
setup.bat
```

### Quick Setup (Linux/Mac)
```bash
chmod +x setup.sh
./setup.sh
```

### Manual Setup

1. **Install dependencies:**
```bash
npm run install-all
```

2. **Setup backend:**
```bash
cd backend
cp env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
```

3. **Start the application:**
```bash
# From root directory
npm run dev

# Or separately
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend  
cd frontend && npm run dev
```

## 🔑 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@orderms.com | admin123 |
| Business Owner | business@dressshop.com | business123 |
| Stock Keeper | stock@orderms.com | stock123 |

## 🌐 Application URLs

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **Sample Form:** http://localhost:3000/form/{formLink}

## 📱 Mobile-First Design

The application is designed mobile-first with responsive layouts:

- **Mobile:** Optimized for phones and tablets
- **Desktop:** Enhanced experience with larger screens
- **Touch-friendly:** Large buttons and intuitive gestures

## 🔄 Order Flow

1. **Admin** creates a tenant and custom order form
2. **Business Owner** publishes the form and shares link via WhatsApp
3. **Customer** fills the form on mobile device with images
4. **Business Owner** confirms the order
5. **Stock Keeper** receives notification and dispatches order

## 📊 Form Field Types

- **Text:** Basic text input
- **Email:** Email validation
- **Phone:** Mobile number input
- **Address:** Multi-line address
- **Amount:** Numeric payment amount
- **File Upload:** Image uploads for dresses/receipts
- **Dropdown:** Selection lists
- **Text Area:** Long text input

## 🔐 Security Features

- JWT-based authentication
- Role-based access control
- Password hashing with bcrypt
- File upload validation
- Input sanitization
- CORS protection

## 📂 Project Structure

```
order-management-system/
├── backend/
│   ├── prisma/           # Database schema and migrations
│   ├── routes/           # API routes
│   ├── middleware/       # Auth and validation middleware
│   ├── lib/             # Database connection
│   └── uploads/         # File storage
├── frontend/
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Main application pages
│   │   ├── contexts/    # React contexts
│   │   └── services/    # API services
│   └── public/          # Static assets
└── README.md
```

## 🚀 Deployment

### Backend Deployment
1. Set environment variables
2. Run database migrations
3. Start the server

### Frontend Deployment
1. Build the application: `npm run build`
2. Serve the built files
3. Configure proxy for API calls

## 🔧 Environment Variables

Create `.env` file in backend directory:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-jwt-key"
PORT=5000
UPLOAD_DIR="uploads"
MAX_FILE_SIZE=5242880
```

## 📞 WhatsApp Integration

The system includes placeholder functions for WhatsApp integration:
- Form link sharing
- Order notifications
- Status updates

To enable real WhatsApp integration, add Twilio credentials:

```env
TWILIO_ACCOUNT_SID="your_account_sid"
TWILIO_AUTH_TOKEN="your_auth_token"
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"
```

## 🐛 Troubleshooting

**Database Issues:**
```bash
cd backend
npx prisma migrate reset
npm run db:seed
```

**Port Conflicts:**
- Backend runs on port 5000
- Frontend runs on port 3000
- Change ports in respective config files

**File Upload Issues:**
- Check `uploads/` directory exists
- Verify file size limits
- Ensure proper permissions

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---

**Built with ❤️ for efficient order management**
