// --- Backend: Express + MongoDB + ExcelJS ---
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const ExcelJS = require("exceljs");
const bodyParser = require("body-parser");
const session = require("express-session");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = 3000;

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// MongoDB Connection
mongoose.connect(
  "mongodb+srv://Subhadip:Subha2004@banashyamnagar.23lepj2.mongodb.net/?retryWrites=true&w=majority&appName=Banashyamnagar"
);

// Schemas
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const doctorSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  profilePicture: String,
  createdAt: { type: Date, default: Date.now },
});

const patientSchema = new mongoose.Schema({
  name: String,
  age: Number,
  disease: String,
  doctorId: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now },
});

// Models
const ContactMessage = mongoose.model("ContactMessage", contactSchema);
const Doctor = mongoose.model("Doctor", doctorSchema);
const Patient = mongoose.model("Patient", patientSchema);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(session({
  secret: "secretkey",
  resave: false,
  saveUninitialized: false,
}));

// Multer Setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// Routes

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public/register.html"));
});

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.send("All fields are required. <a href='/register'>Go back</a>");
  }
  const existingDoctor = await Doctor.findOne({ email });
  if (existingDoctor) {
    return res.send("Email already registered. <a href='/login'>Login</a>");
  }
  await new Doctor({ name, email, password }).save();
  res.send("Registration successful! <a href='/login'>Login</a>");
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const doctor = await Doctor.findOne({ email, password });
  if (!doctor) {
    return res.send("Invalid credentials. <a href='/login'>Try again</a>");
  }
  req.session.doctorId = doctor._id;
  res.redirect("/dashboard");
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");

  const doctor = await Doctor.findById(req.session.doctorId);
  const patients = await Patient.find({ doctorId: doctor._id });

  const patientListHTML = patients.map((p, i) => `
    <tr class="text-center">
      <td class="py-1 px-2 border">${i + 1}</td>
      <td class="py-1 px-2 border">${p.name}</td>
      <td class="py-1 px-2 border">${p.age}</td>
      <td class="py-1 px-2 border">${p.disease}</td>
      <td class="py-1 px-2 border">${p.createdAt.toLocaleString()}</td>
    </tr>`).join("");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100">
      <nav class="bg-blue-600 text-white p-4 flex justify-between">
        <div class="text-xl font-bold">DASHBOARD</div>
        <div>
          <a href="/" class="mx-2">Home</a>
          <a href="/contact.html" class="mx-2">Contact Us</a>
        </div>
      </nav>

      <div class="bg-white p-6 shadow rounded mb-4 flex justify-between">
        <div>
          <h2 class="text-2xl font-bold">Welcome, Dr. ${doctor.name}</h2>
          <p>Email: ${doctor.email}</p>
          <p>Registered on: ${doctor.createdAt.toLocaleString()}</p>
          <form action="/upload-profile" method="POST" enctype="multipart/form-data" class="mt-4">
            <input type="file" name="profilePicture" accept="image/*">
            <button type="submit" class="bg-blue-500 text-white px-3 py-1 rounded">Upload</button>
          </form>
        </div>
        <div>
          <img src="${doctor.profilePicture || "/default-profile.png"}" class="w-32 h-32 rounded-full object-cover border">
        </div>
      </div>

      <div class="mb-4">
        <a href="/addpatient.html" class="bg-blue-600 text-white px-4 py-2 rounded">➕ Add Patient</a>
        <a href="/export" class="bg-green-600 text-white px-4 py-2 rounded ml-2">Download Excel</a>
        <a href="/download-pdf" class="bg-red-600 text-white px-4 py-2 rounded ml-2">Download PDF</a>
      </div>

      <table class="min-w-full bg-white border rounded">
        <thead>
          <tr>
            <th class="py-2 px-4 border">Sl. No.</th>
            <th class="py-2 px-4 border">Name</th>
            <th class="py-2 px-4 border">Age</th>
            <th class="py-2 px-4 border">Disease</th>
            <th class="py-2 px-4 border">Registered At</th>
          </tr>
        </thead>
        <tbody>${patientListHTML}</tbody>
      </table>

      <footer class="text-center text-sm py-4 mt-8 bg-blue-600 text-white">
        &copy; 2025 Banashyamnagar Church Doctor Camp System.
      </footer>
    </body>
    </html>
  `);
});

app.post("/upload-profile", upload.single("profilePicture"), async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const filePath = "/uploads/" + req.file.filename;
  await Doctor.findByIdAndUpdate(req.session.doctorId, { profilePicture: filePath });
  res.redirect("/dashboard");
});

app.post("/add-patient", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const { name, age, disease } = req.body;
  await new Patient({ name, age, disease, doctorId: req.session.doctorId }).save();
  res.redirect("/dashboard");
});

app.post("/contact", async (req, res) => {
  res.sendFile(path.join(__dirname, "public/contact.html"));

  if (!name || !email || !message) return res.status(400).send("All fields required.");
  await new ContactMessage({ name, email, message }).save();
  res.send(`<h2 style="color:green;text-align:center;">Thanks for your message!</h2><p style="text-align:center;"><a href="/">Back Home</a></p>`);
});

app.get("/export", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const patients = await Patient.find({ doctorId: req.session.doctorId });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patients");
  sheet.columns = [
    { header: "Sl. No.", key: "slNo" },
    { header: "Name", key: "name" },
    { header: "Age", key: "age" },
    { header: "Disease", key: "disease" },
    { header: "Registered At", key: "createdAt" },
  ];
  patients.forEach((p, i) => sheet.addRow({
    slNo: i + 1, name: p.name, age: p.age, disease: p.disease, createdAt: p.createdAt
  }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=patients.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

app.get("/download-pdf", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const patients = await Patient.find({ doctorId: req.session.doctorId });

  const doc = new PDFDocument();
  res.setHeader("Content-Disposition", "attachment; filename=patients.pdf");
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(16).text("Patient List", { align: "center" }).moveDown();
  patients.forEach((p, i) => {
    doc.fontSize(12).text(`${i + 1}. ${p.name}, Age: ${p.age}, Disease: ${p.disease}, Registered: ${p.createdAt.toLocaleString()}`).moveDown(0.5);
  });
  doc.end();
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
