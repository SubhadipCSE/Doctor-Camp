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
const PORT = process.env.PORT || 3000;

// MongoDB Connection (with options for Render + Atlas)
mongoose
  .connect("mongodb+srv://Subhadip:Subha2004@banashyamnagar.23lepj2.mongodb.net/DoctorCamp?retryWrites=true&w=majority", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    ssl: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Schemas
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
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  createdAt: { type: Date, default: Date.now },
});

// Models
const Doctor = mongoose.model("Doctor", doctorSchema);
const Patient = mongoose.model("Patient", patientSchema);
const Contact = mongoose.model("Contact", contactSchema);

// Middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: "doctorcampsecret",
    resave: false,
    saveUninitialized: false,
  })
);

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Pages
const sendHtml = (res, file) =>
  res.sendFile(path.join(__dirname, "public", file));

// Routes
app.get("/", (_, res) => sendHtml(res, "index.html"));
app.get("/register", (_, res) => sendHtml(res, "register.html"));
app.get("/login", (_, res) => sendHtml(res, "login.html"));
app.get("/contact.html", (_, res) => sendHtml(res, "contact.html"));
app.get("/addpatient.html", (_, res) => sendHtml(res, "addpatient.html"));

// Register doctor
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.send("All fields required.");
  const existing = await Doctor.findOne({ email });
  if (existing) return res.send("Email already exists.");
  await new Doctor({ name, email, password }).save();
  res.redirect("/login");
});

// Doctor login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const doctor = await Doctor.findOne({ email, password });
  if (!doctor) return res.send("Invalid credentials.");
  req.session.doctorId = doctor._id;
  res.redirect("/dashboard");
});

// Dashboard
app.get("/dashboard", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const doctor = await Doctor.findById(req.session.doctorId);
  const patients = await Patient.find({ doctorId: doctor._id });

  const patientRows = patients
    .map(
      (p, i) => `
    <tr class="text-center">
      <td class="border p-2">${i + 1}</td>
      <td class="border p-2">${p.name}</td>
      <td class="border p-2">${p.age}</td>
      <td class="border p-2">${p.disease}</td>
      <td class="border p-2">${p.createdAt.toLocaleString()}</td>
    </tr>`
    )
    .join("");

  res.send(`
  <!DOCTYPE html>
  <html>
  <head><title>Dashboard</title><script src="https://cdn.tailwindcss.com"></script></head>
  <body class="bg-gray-100">
    <nav class="bg-blue-600 p-4 text-white flex justify-between">
      <div>Doctor Dashboard</div>
      <div><a href="/" class="px-2">Home</a><a href="/contact.html" class="px-2">Contact</a></div>
    </nav>
    <section class="p-4 bg-white shadow mt-4">
      <h1 class="text-xl font-bold">Welcome Dr. ${doctor.name}</h1>
      <p>Email: ${doctor.email}</p>
      <img src="${doctor.profilePicture || "/default-profile.png"}" class="w-32 h-32 mt-2 border rounded-full" />
      <form action="/upload-profile" method="POST" enctype="multipart/form-data">
        <input type="file" name="profilePicture" required />
        <button type="submit" class="bg-blue-500 text-white px-4 py-1 rounded">Upload</button>
      </form>
    </section>
    <section class="p-4">
      <a href="/addpatient.html" class="bg-green-600 text-white px-4 py-2 rounded">+ Add Patient</a>
      <a href="/export" class="bg-yellow-500 text-white px-4 py-2 rounded ml-2">Download Excel</a>
      <a href="/download-pdf" class="bg-red-600 text-white px-4 py-2 rounded ml-2">Download PDF</a>
    </section>
    <table class="m-4 w-full border bg-white">
      <thead><tr><th>Sl.</th><th>Name</th><th>Age</th><th>Disease</th><th>Registered At</th></tr></thead>
      <tbody>${patientRows}</tbody>
    </table>
  </body></html>`);
});

// Upload profile picture
app.post("/upload-profile", upload.single("profilePicture"), async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const pathUrl = "/uploads/" + req.file.filename;
  await Doctor.findByIdAndUpdate(req.session.doctorId, { profilePicture: pathUrl });
  res.redirect("/dashboard");
});

// Add patient
app.post("/add-patient", async (req, res) => {
  const { name, age, disease } = req.body;
  if (!req.session.doctorId) return res.redirect("/login");
  await new Patient({ name, age, disease, doctorId: req.session.doctorId }).save();
  res.redirect("/dashboard");
});

// Contact
app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.send("All fields are required.");
  await new Contact({ name, email, message }).save();
  res.send("<h3>Thanks for your message!</h3><a href='/'>Back to Home</a>");
});

// Export Excel
app.get("/export", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const patients = await Patient.find({ doctorId: req.session.doctorId });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Patients");

  sheet.columns = [
    { header: "Sl.", key: "sl" },
    { header: "Name", key: "name" },
    { header: "Age", key: "age" },
    { header: "Disease", key: "disease" },
    { header: "Registered At", key: "createdAt" },
  ];
  patients.forEach((p, i) => {
    sheet.addRow({
      sl: i + 1,
      name: p.name,
      age: p.age,
      disease: p.disease,
      createdAt: p.createdAt,
    });
  });

  res.setHeader("Content-Disposition", "attachment; filename=patients.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await workbook.xlsx.write(res);
  res.end();
});

// Export PDF
app.get("/download-pdf", async (req, res) => {
  if (!req.session.doctorId) return res.redirect("/login");
  const patients = await Patient.find({ doctorId: req.session.doctorId });
  const buffers = [];
  const doc = new PDFDocument();
  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", () => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=patients.pdf");
    res.send(Buffer.concat(buffers));
  });

  doc.fontSize(16).text("Patient List", { align: "center" }).moveDown();
  patients.forEach((p, i) => {
    doc.text(`${i + 1}. ${p.name}, Age: ${p.age}, Disease: ${p.disease}, Registered: ${p.createdAt.toLocaleString()}`);
  });
  doc.end();
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
