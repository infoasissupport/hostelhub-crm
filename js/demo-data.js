/* ==========================================================================
   HostelHub — Demo data generator
   --------------------------------------------------------------------------
   Builds one consistent, relational dataset. Dates are generated relative to
   the day the data is seeded so the dashboard always has "today" activity.
   The generator is deterministic (seeded PRNG) so a reset always restores
   the same initial state for the same seeding day.

   COLLECTIONS (localStorage key "hh:<name>")
   settings          object  — hostel profile, branches, lookups, preferences
   residents         RES-0001  { name, gender, dob, phone, email, address, guardianName, guardianRelation,
                                 guardianPhone, emergencyName, emergencyPhone, course, joinDate, branch, roomId,
                                 bed, rent, deposit, status, checkIn, checkOut, notes, documents[], photo }
   rooms             RM-A101   { branch, building, floor, number, type, capacity, rent, facilities[], status,
                                 beds:[{ id:'B1', label:'Bed 1', status:'Available'|'Maintenance' }] }
                                 (bed occupancy is DERIVED from active residents' roomId + bed)
   messPlans         MP-01     { name, meals[], monthlyCharge, description, status }
   messSubscriptions MS-0001   { residentId, planId, startDate, endDate, status, notes }
   attendance        ATT-YYYYMMDD-<meal>  { date, meal, marks:{ residentId:'P'|'A'|'NA' }, updatedAt }
   menus             MN-0001   { date, meal, items, ingredients, start, end, cost, servings, notes }
   vendors           VEN-01    { name, phone, email, category, address }
   inventory         ITM-001   { name, category, unit, stock, minStock, price, supplier, purchaseDate, expiryDate, location }
   stockTx           STX-0001  { itemId, date, type:'Purchase'|'Consumption'|'Adjustment', qty, unitPrice, vendor, note, by }
   invoices          INV-1001  { residentId, issueDate, dueDate, period, items:[{category, description, amount}], discount,
                                 taxRate, lateFee, notes, status, payments:[{ id, date, amount, method, reference, note }] }
   expenses          EXP-0001  { date, category, description, amount, vendor, method, attachment, branch, status, approvedBy, notes }
   staff             STF-001   { name, gender, phone, email, designation, department, branch, salary, shift, joinDate, status, address, notes, photo }
   staffAttendance   SA-YYYYMMDD { date, marks:{ staffId:'P'|'A'|'L'|'H' } }
   salaries          SAL-0001  { staffId, month:'YYYY-MM', basic, allowances, deductions, net, status, paidOn, method }
   maintenance       MT-0001   { title, category, branch, roomId, priority, assignedTo, reportedOn, dueDate, completedOn,
                                 estCost, actualCost, status, notes, comments[], worklog[] }
   visitors          VIS-0001  { name, phone, idProof, residentId, purpose, checkIn, checkOut, branch, notes }
   complaints        CMP-0001  { residentId, category, subject, description, priority, assignedTo, status, createdAt,
                                 resolvedAt, resolution, history:[{ date, status, note, by }] }
   notices           NTC-001   { title, message, category, audience, branch, publishDate, expiryDate, status, read, createdAt }
   ========================================================================== */
(function () {
  "use strict";

  const VERSION = 4;

  function build(today) {
    today = today ? new Date(today) : new Date();
    today.setHours(12, 0, 0, 0);

    /* ---------- deterministic PRNG ---------- */
    let seed = 20261006;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ri = (a, b) => Math.floor(rand() * (b - a + 1)) + a;
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const chance = (p) => rand() < p;
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const daysAgo = (n) => iso(addDays(today, -n));
    const dt = (dateStr, h, m) => `${dateStr}T${pad(h)}:${pad(m)}`;
    const T = iso(today);

    /* ---------- settings ---------- */
    const settings = {
      hostel: {
        name: "HostelHub Residency",
        tagline: "Smart Hostel, Happier Students",
        email: "admin@hostelhub.demo",
        phone: "+91 98470 12345",
        address: "Kaloor, Kochi, Kerala 682017",
        gstin: "32ABCDE1234F1Z5",
        website: "www.hostelhub.demo",
        invoiceFooter: "Thank you for staying with HostelHub. This is a demo document.",
      },
      branches: [
        { id: "BR-1", name: "Main Hostel", address: "Kaloor, Kochi", warden: "Suresh Menon", phone: "+91 98470 11111" },
        { id: "BR-2", name: "North Wing Hostel", address: "Edappally, Kochi", warden: "Rajesh Pillai", phone: "+91 98470 22222" },
        { id: "BR-3", name: "City Girls Hostel", address: "MG Road, Kochi", warden: "Lakshmi Nair", phone: "+91 98470 33333" },
      ],
      roomTypes: [
        { id: "RT-1", name: "Single", capacity: 1, rent: 9000 },
        { id: "RT-2", name: "Double", capacity: 2, rent: 7000 },
        { id: "RT-3", name: "Triple", capacity: 3, rent: 6000 },
        { id: "RT-4", name: "Dormitory", capacity: 4, rent: 5000 },
      ],
      feeCategories: [
        { id: "FC-1", name: "Hostel Rent", amount: 0 },
        { id: "FC-2", name: "Mess Fee", amount: 0 },
        { id: "FC-3", name: "Security Deposit", amount: 10000 },
        { id: "FC-4", name: "Laundry", amount: 600 },
        { id: "FC-5", name: "Electricity", amount: 450 },
        { id: "FC-6", name: "Late Fee", amount: 200 },
        { id: "FC-7", name: "Other", amount: 0 },
      ],
      expenseCategories: [
        { id: "EC-1", name: "Food Purchase", color: "#FFC400" },
        { id: "EC-2", name: "Staff Salary", color: "#1683FF" },
        { id: "EC-3", name: "Utilities", color: "#10B981" },
        { id: "EC-4", name: "Maintenance", color: "#8B5CF6" },
        { id: "EC-5", name: "Others", color: "#EC4899" },
      ],
      mealTypes: [
        { id: "ML-1", name: "Breakfast", start: "07:00", end: "09:30", rate: 40 },
        { id: "ML-2", name: "Lunch", start: "12:00", end: "14:30", rate: 70 },
        { id: "ML-3", name: "Dinner", start: "19:00", end: "21:30", rate: 60 },
      ],
      paymentMethods: [
        { id: "PM-1", name: "Cash" }, { id: "PM-2", name: "UPI" },
        { id: "PM-3", name: "Bank Transfer" }, { id: "PM-4", name: "Card" },
      ],
      designations: [
        { id: "DG-1", name: "Warden", department: "Administration" },
        { id: "DG-2", name: "Assistant Warden", department: "Administration" },
        { id: "DG-3", name: "Accountant", department: "Accounts" },
        { id: "DG-4", name: "Head Cook", department: "Kitchen" },
        { id: "DG-5", name: "Cook", department: "Kitchen" },
        { id: "DG-6", name: "Kitchen Helper", department: "Kitchen" },
        { id: "DG-7", name: "Electrician", department: "Maintenance" },
        { id: "DG-8", name: "Plumber", department: "Maintenance" },
        { id: "DG-9", name: "Housekeeping", department: "Housekeeping" },
        { id: "DG-10", name: "Security Guard", department: "Security" },
      ],
      departments: ["Administration", "Accounts", "Kitchen", "Maintenance", "Housekeeping", "Security"],
      dateFormat: "DD MMM YYYY",
      currency: "INR",
      currencySymbol: "₹",
      taxRate: 0,
      lateFeeAmount: 200,
      invoiceDueDay: 10,
      notifications: { lowStock: true, expiry: true, fees: true, maintenance: true, complaints: true, notices: true, visitors: true },
      roles: [
        { id: "RL-1", name: "Super Admin", description: "Full access to every module", permissions: ["all"] },
        { id: "RL-2", name: "Warden", description: "Residents, rooms, visitors, complaints", permissions: ["residents", "rooms", "visitors", "complaints", "maintenance", "notices"] },
        { id: "RL-3", name: "Accountant", description: "Fees, invoices, expenses, reports", permissions: ["fees", "invoices", "expenses", "reports"] },
        { id: "RL-4", name: "Mess Manager", description: "Mess, menu, attendance, kitchen", permissions: ["mess", "menu", "attendance", "kitchen"] },
      ],
      users: [
        { id: "USR-1", name: "Admin", email: "admin@hostelhub.demo", role: "Super Admin", status: "Active" },
        { id: "USR-2", name: "Suresh Menon", email: "warden@hostelhub.demo", role: "Warden", status: "Active" },
        { id: "USR-3", name: "Anitha Joseph", email: "accounts@hostelhub.demo", role: "Accountant", status: "Active" },
        { id: "USR-4", name: "Biju Thomas", email: "mess@hostelhub.demo", role: "Mess Manager", status: "Active" },
      ],
      currentUser: { name: "Admin", role: "Super Admin", email: "admin@hostelhub.demo" },
    };

    /* ---------- name pools ---------- */
    const maleFirst = ["Rahul", "Vishnu", "Arjun", "Akhil", "Rohit", "Nikhil", "Abhishek", "Sanjay", "Kiran", "Aditya", "Varun", "Gokul", "Sreeraj", "Jithin", "Aravind", "Harish", "Manu", "Deepak", "Ajay", "Naveen", "Pranav", "Sidharth", "Anand", "Vivek", "Karthik", "Tom", "Alan", "Jerin", "Fahad", "Irfan", "Midhun", "Amal", "Ashwin", "Ritesh", "Yash", "Kunal", "Sachin", "Vineeth", "Bibin", "Nithin"];
    const femaleFirst = ["Anjali", "Sneha", "Priya", "Aishwarya", "Divya", "Meera", "Neha", "Kavya", "Athira", "Lakshmi", "Riya", "Pooja", "Gayathri", "Anusha", "Nimisha", "Sruthi", "Aparna", "Fathima", "Ann", "Teena", "Haritha", "Keerthana", "Swathi", "Devika", "Malavika", "Revathi", "Sana", "Nandana", "Reshma", "Shilpa"];
    const lastNames = ["Kumar", "Nair", "Menon", "Pillai", "Das", "Sharma", "Varghese", "Thomas", "Joseph", "Krishnan", "Raj", "Iyer", "Reddy", "Mathew", "George", "Rao", "Shetty", "Gupta", "Verma", "Babu", "Mohan", "Jose", "Kurian", "Ali", "Khan", "Patel", "Chandran", "Unnikrishnan", "Warrier", "Sebastian"];
    const courses = ["B.Tech Computer Science", "B.Tech Mechanical", "B.Tech Electronics", "B.Com", "BBA", "MBA", "M.Tech", "B.Sc Nursing", "BCA", "MCA", "B.Arch", "Software Engineer", "Data Analyst", "Bank Officer", "Medical Intern", "CA Articleship", "B.Sc Physics", "BA English"];
    const cities = ["Thrissur", "Kozhikode", "Kannur", "Palakkad", "Kollam", "Alappuzha", "Kottayam", "Malappuram", "Trivandrum", "Idukki", "Coimbatore", "Mangalore", "Chennai", "Bengaluru"];
    const relations = ["Father", "Mother", "Uncle", "Brother", "Guardian"];
    const usedPhones = new Set();
    const phone = () => { let p; do { p = `9${ri(6, 9)}${ri(10000000, 99999999)}`; } while (usedPhones.has(p)); usedPhones.add(p); return p; };

    /* ---------- rooms ---------- */
    const typeByName = Object.fromEntries(settings.roomTypes.map((t) => [t.name, t]));
    const pattern = ["Triple", "Triple", "Double", "Dormitory", "Triple", "Single", "Dormitory", "Triple"];
    const facilitiesPool = ["Wi-Fi", "Attached Bath", "AC", "Study Table", "Wardrobe", "Balcony", "Geyser", "Fan"];
    const layout = [
      { branch: "BR-1", building: "Block A", code: "A", floors: 3, perFloor: 8 },
      { branch: "BR-1", building: "Block B", code: "B", floors: 3, perFloor: 8 },
      { branch: "BR-2", building: "North Block", code: "N", floors: 3, perFloor: 6 },
      { branch: "BR-3", building: "Girls Block", code: "G", floors: 3, perFloor: 6 },
    ];
    const rooms = [];
    let pIdx = 0;
    layout.forEach((b) => {
      for (let f = 1; f <= b.floors; f++) {
        for (let n = 1; n <= b.perFloor; n++) {
          const type = typeByName[pattern[pIdx++ % pattern.length]];
          const number = `${b.code}-${f}${pad(n)}`;
          const fac = ["Wi-Fi", "Study Table", "Wardrobe", "Fan"];
          if (type.name === "Single" || chance(0.4)) fac.push("Attached Bath");
          if (type.name === "Single" || chance(0.15)) fac.push("AC");
          if (chance(0.25)) fac.push("Balcony");
          const beds = [];
          for (let k = 1; k <= type.capacity; k++) beds.push({ id: `B${k}`, label: `Bed ${k}`, status: "Available" });
          rooms.push({
            id: `RM-${number.replace("-", "")}`, branch: b.branch, building: b.building, floor: f, number,
            type: type.name, capacity: type.capacity, rent: type.rent + (fac.includes("AC") ? 1500 : 0),
            facilities: Array.from(new Set(fac)), status: "Available", beds, notes: "",
          });
        }
      }
    });
    // A couple of rooms under maintenance / a bed out of service
    rooms[13].status = "Maintenance"; rooms[13].notes = "Ceiling leak repair in progress";
    rooms[40].status = "Maintenance"; rooms[40].notes = "Repainting";
    rooms[7].beds[2] && (rooms[7].beds[2].status = "Maintenance");

    /* ---------- residents ---------- */
    const residents = [];
    let resN = 0;
    const makeResident = (gender, branch) => {
      resN++;
      const first = gender === "Female" ? pick(femaleFirst) : pick(maleFirst);
      const last = pick(lastNames);
      const name = `${first} ${last}`;
      const city = pick(cities);
      const join = addDays(today, -ri(6, 520));
      const gFirst = gender === "Female" ? pick(maleFirst) : pick(maleFirst);
      return {
        id: `RES-${pad(resN, 4)}`, name, photo: "", gender,
        dob: iso(new Date(today.getFullYear() - ri(18, 27), ri(0, 11), ri(1, 28))),
        phone: phone(), email: `${first}.${last}${ri(1, 99)}`.toLowerCase() + "@mail.demo",
        address: `${ri(1, 220)}, ${pick(["MG Road", "Temple Road", "Church Street", "Market Road", "Station Road", "Lake View"])}, ${city}`,
        guardianName: `${gFirst} ${last}`, guardianRelation: pick(relations), guardianPhone: phone(),
        emergencyName: `${pick(maleFirst)} ${last}`, emergencyPhone: phone(),
        course: pick(courses), joinDate: iso(join), branch, roomId: "", bed: "",
        rent: 0, deposit: pick([5000, 8000, 10000, 10000, 15000]), status: "Active",
        checkIn: iso(join), checkOut: "", notes: "", documents: [], messPlan: "",
        createdAt: iso(join),
      };
    };
    rooms.forEach((room) => {
      if (room.status !== "Available") return;
      room.beds.forEach((bed) => {
        if (bed.status !== "Available") return;
        if (chance(0.14)) return; // vacant
        const gender = room.branch === "BR-3" ? "Female" : (chance(0.9) ? "Male" : "Female");
        const r = makeResident(gender, room.branch);
        r.roomId = room.id; r.bed = bed.id; r.rent = room.rent;
        residents.push(r);
      });
    });
    // Ensure the most recent joiners look recent (dashboard "Recent Residents")
    residents.slice(-6).forEach((r, i) => { const d = daysAgo(i * 3 + 1); r.joinDate = d; r.checkIn = d; r.createdAt = d; });
    // past residents (checked out / inactive)
    for (let i = 0; i < 28; i++) {
      const branch = pick(["BR-1", "BR-1", "BR-2", "BR-3"]);
      const r = makeResident(branch === "BR-3" ? "Female" : "Male", branch);
      r.status = i < 20 ? "Checked Out" : "Inactive";
      const out = addDays(today, -ri(10, 200));
      r.joinDate = iso(addDays(out, -ri(120, 400))); r.checkIn = r.joinDate; r.createdAt = r.joinDate;
      r.checkOut = r.status === "Checked Out" ? iso(out) : "";
      r.rent = pick([5000, 6000, 7000, 9000]);
      r.notes = r.status === "Checked Out" ? "Course completed — deposit refunded." : "Long leave — room released.";
      residents.push(r);
    }
    // 2 active residents on leave
    residents[5].status = "On Leave"; residents[5].notes = "Home visit until next week.";
    residents[30].notes = "Vegetarian. Prefers ground floor.";
    residents[2].documents = [{ name: "Aadhaar Card.pdf", type: "application/pdf", size: 182344, uploadedOn: residents[2].joinDate }, { name: "College ID.jpg", type: "image/jpeg", size: 90211, uploadedOn: residents[2].joinDate }];
    const activeResidents = residents.filter((r) => r.status === "Active" || r.status === "On Leave");

    /* ---------- mess ---------- */
    const messPlans = [
      { id: "MP-01", name: "Full Board", meals: ["Breakfast", "Lunch", "Dinner"], monthlyCharge: 3500, description: "All three meals, every day of the month.", status: "Active" },
      { id: "MP-02", name: "Breakfast + Dinner", meals: ["Breakfast", "Dinner"], monthlyCharge: 2600, description: "Ideal for working professionals.", status: "Active" },
      { id: "MP-03", name: "Lunch Only", meals: ["Lunch"], monthlyCharge: 1600, description: "Weekday and weekend lunch.", status: "Active" },
      { id: "MP-04", name: "Weekend Special", meals: ["Breakfast", "Lunch", "Dinner"], monthlyCharge: 1200, description: "Saturday & Sunday meals only.", status: "Inactive" },
    ];
    const planById = Object.fromEntries(messPlans.map((p) => [p.id, p]));
    const messSubscriptions = [];
    activeResidents.forEach((r) => {
      if (chance(0.12)) return;
      const planId = chance(0.72) ? "MP-01" : chance(0.6) ? "MP-02" : "MP-03";
      r.messPlan = planId;
      messSubscriptions.push({ id: `MS-${pad(messSubscriptions.length + 1, 4)}`, residentId: r.id, planId, startDate: r.joinDate, endDate: "", status: "Active", notes: "" });
    });
    residents.filter((r) => r.status === "Checked Out").slice(0, 8).forEach((r) => {
      messSubscriptions.push({ id: `MS-${pad(messSubscriptions.length + 1, 4)}`, residentId: r.id, planId: "MP-01", startDate: r.joinDate, endDate: r.checkOut, status: "Cancelled", notes: "Closed on check-out" });
    });

    /* ---------- meal attendance (sheets) ---------- */
    const attendance = [];
    const meals = settings.mealTypes.map((m) => m.name);
    const baseRate = { Breakfast: 0.62, Lunch: 0.74, Dinner: 0.56 };
    for (let d = 13; d >= 0; d--) {
      const date = daysAgo(d);
      const weekend = [0, 6].includes(addDays(today, -d).getDay());
      meals.forEach((meal) => {
        const marks = {};
        const rate = baseRate[meal] + (weekend ? -0.08 : 0) + (rand() * 0.16 - 0.08);
        activeResidents.forEach((r) => {
          if (r.joinDate > date) return;
          const plan = planById[r.messPlan];
          if (!plan || !plan.meals.includes(meal)) { marks[r.id] = "NA"; return; }
          if (r.status === "On Leave") { marks[r.id] = "A"; return; }
          marks[r.id] = chance(rate) ? "P" : "A";
        });
        attendance.push({ id: `ATT-${date.replace(/-/g, "")}-${meal[0]}`, date, meal, marks, updatedAt: dt(date, 10, 0) });
      });
    }

    /* ---------- menus ---------- */
    const weekly = [
      ["Idli, Sambar, Coconut Chutney, Upma, Tea / Coffee", "Rice, Sambar, Rasam, Avial, Chicken Curry, Cabbage Thoran", "Chapathi, Veg Curry, Dal Fry, Fish Curry, Curd, Pickle"],
      ["Puttu, Kadala Curry, Banana, Tea / Coffee", "Rice, Moru Curry, Beans Thoran, Fish Fry, Pappadam", "Porotta, Egg Roast, Veg Kurma, Salad"],
      ["Dosa, Tomato Chutney, Sambar, Tea / Coffee", "Veg Biryani, Raita, Boiled Egg, Pickle", "Chapathi, Paneer Butter Masala, Dal Tadka, Curd"],
      ["Appam, Veg Stew, Fruit Bowl, Tea / Coffee", "Rice, Pulissery, Chicken Fry, Beetroot Thoran", "Kanji, Payar, Pappadam, Pickle"],
      ["Poori, Potato Masala, Tea / Coffee", "Rice, Fish Curry, Cabbage Thoran, Rasam, Curd", "Fried Rice, Gobi Manchurian, Chilli Chicken"],
      ["Idiyappam, Egg Curry, Tea / Coffee", "Chicken Biryani, Raita, Salad, Payasam", "Chapathi, Chana Masala, Mixed Veg, Curd"],
      ["Pongal, Vada, Coconut Chutney, Tea / Coffee", "Kerala Sadya — Rice, Sambar, Avial, Olan, Payasam", "Ghee Rice, Chicken Curry, Salad, Ice Cream"],
    ];
    const ingredientsFor = { Breakfast: "Rice flour, urad dal, coconut, vegetables, milk, tea", Lunch: "Rice, dal, vegetables, chicken/fish, spices, curd", Dinner: "Wheat flour, vegetables, dal, oil, spices" };
    const costFor = { Breakfast: 32, Lunch: 58, Dinner: 46 };
    const menus = [];
    for (let d = -14; d <= 7; d++) {
      const date = addDays(today, d);
      const wd = (date.getDay() + 6) % 7; // Monday = 0
      settings.mealTypes.forEach((m, mi) => {
        menus.push({
          id: `MN-${pad(menus.length + 1, 4)}`, date: iso(date), meal: m.name, items: weekly[wd][mi],
          ingredients: ingredientsFor[m.name], start: m.start, end: m.end, cost: costFor[m.name] + ri(-4, 6),
          servings: Math.round(activeResidents.length * baseRate[m.name]), notes: d === 0 && mi === 2 ? "Special dessert for the birthday celebration." : "",
        });
      });
    }

    /* ---------- vendors & inventory ---------- */
    const vendors = [
      { id: "VEN-01", name: "Fresh Farm Vegetables", phone: "9847012001", email: "orders@freshfarm.demo", category: "Vegetables", address: "Ernakulam Market" },
      { id: "VEN-02", name: "Kerala Rice Traders", phone: "9847012002", email: "sales@keralarice.demo", category: "Grains", address: "Broadway, Kochi" },
      { id: "VEN-03", name: "Milma Dairy Point", phone: "9847012003", email: "kochi@milma.demo", category: "Dairy", address: "Edappally" },
      { id: "VEN-04", name: "Spice Route Wholesale", phone: "9847012004", email: "hello@spiceroute.demo", category: "Spices", address: "Mattancherry" },
      { id: "VEN-05", name: "Coastal Fish & Meat", phone: "9847012005", email: "coastal@meat.demo", category: "Meat & Fish", address: "Vypin" },
      { id: "VEN-06", name: "CleanPro Supplies", phone: "9847012006", email: "cleanpro@supplies.demo", category: "Cleaning", address: "Kaloor" },
      { id: "VEN-07", name: "Metro Kitchen Mart", phone: "9847012007", email: "metro@kitchen.demo", category: "Kitchen Supplies", address: "Palarivattom" },
      { id: "VEN-08", name: "KSEB / Utilities", phone: "1912", email: "billing@kseb.demo", category: "Utilities", address: "Kochi" },
    ];
    const items = [
      ["Rice (Matta)", "Grains", "kg", 52, 300, "VEN-02", 180], ["Raw Rice", "Grains", "kg", 46, 150, "VEN-02", 120], ["Wheat Flour (Atta)", "Grains", "kg", 42, 100, "VEN-02", 90],
      ["Toor Dal", "Pulses", "kg", 128, 40, "VEN-02", 90], ["Urad Dal", "Pulses", "kg", 118, 25, "VEN-02", 120], ["Green Gram", "Pulses", "kg", 105, 20, "VEN-02", 100],
      ["Onion", "Vegetables", "kg", 38, 60, "VEN-01", 12], ["Tomato", "Vegetables", "kg", 32, 40, "VEN-01", 8], ["Potato", "Vegetables", "kg", 30, 50, "VEN-01", 20],
      ["Cabbage", "Vegetables", "kg", 28, 25, "VEN-01", 10], ["Carrot", "Vegetables", "kg", 44, 20, "VEN-01", 10], ["Coconut", "Vegetables", "pcs", 32, 120, "VEN-01", 25],
      ["Milk", "Dairy", "ltr", 54, 60, "VEN-03", 4], ["Curd", "Dairy", "kg", 60, 25, "VEN-03", 3], ["Paneer", "Dairy", "kg", 380, 10, "VEN-03", 5],
      ["Chicken", "Meat & Fish", "kg", 210, 40, "VEN-05", 3], ["Fish (Sardine)", "Meat & Fish", "kg", 180, 30, "VEN-05", 2], ["Eggs", "Meat & Fish", "tray", 165, 12, "VEN-05", 10],
      ["Coconut Oil", "Oil", "ltr", 245, 40, "VEN-04", 240], ["Sunflower Oil", "Oil", "ltr", 155, 30, "VEN-04", 240],
      ["Chilli Powder", "Spices", "kg", 320, 6, "VEN-04", 300], ["Turmeric Powder", "Spices", "kg", 260, 4, "VEN-04", 300], ["Coriander Powder", "Spices", "kg", 240, 5, "VEN-04", 300], ["Salt", "Spices", "kg", 22, 20, "VEN-04", 600],
      ["Tea Powder", "Beverages", "kg", 420, 8, "VEN-04", 365], ["Coffee Powder", "Beverages", "kg", 560, 5, "VEN-04", 365], ["Sugar", "Beverages", "kg", 44, 50, "VEN-02", 365],
      ["Dish Wash Liquid", "Cleaning", "ltr", 140, 15, "VEN-06", 730], ["Floor Cleaner", "Cleaning", "ltr", 120, 20, "VEN-06", 730], ["Garbage Bags", "Cleaning", "pack", 90, 15, "VEN-06", 1000],
      ["LPG Cylinder", "Kitchen Supplies", "pcs", 1850, 3, "VEN-07", 0], ["Aluminium Foil", "Kitchen Supplies", "roll", 180, 6, "VEN-07", 1000],
    ];
    const inventory = []; const stockTx = [];
    const locations = ["Main Store", "Cold Storage", "Kitchen Rack", "Dry Store"];
    items.forEach((it, i) => {
      const [name, category, unit, price, minStock, supplier, shelf] = it;
      const id = `ITM-${pad(i + 1, 3)}`;
      let stock = 0; let lastPurchase = daysAgo(40);
      for (let d = 56; d >= 0; d -= ri(7, 14)) {
        const qty = Math.max(1, Math.round(minStock * (1.4 + rand())));
        const date = daysAgo(d);
        stockTx.push({ id: "", itemId: id, date, type: "Purchase", qty, unitPrice: price, vendor: supplier, note: "Regular purchase", by: "Biju Thomas" });
        stock += qty; lastPurchase = date;
        const used = Math.round(qty * (0.7 + rand() * 0.35));
        const useDate = daysAgo(Math.max(0, d - ri(2, 6)));
        stockTx.push({ id: "", itemId: id, date: useDate, type: "Consumption", qty: Math.min(used, stock), unitPrice: price, vendor: "", note: "Daily kitchen usage", by: "Kitchen" });
        stock -= Math.min(used, stock);
      }
      if (i === 6 || i === 12 || i === 18 || i === 26 || i === 30) { // force low stock items
        const use = Math.max(0, stock - Math.round(minStock * 0.5));
        if (use > 0) { stockTx.push({ id: "", itemId: id, date: daysAgo(1), type: "Consumption", qty: use, unitPrice: price, vendor: "", note: "Bulk cooking", by: "Kitchen" }); stock -= use; }
      }
      const expiry = shelf ? iso(addDays(new Date(lastPurchase), shelf)) : "";
      inventory.push({ id, name, category, unit, stock, minStock, price, supplier, purchaseDate: lastPurchase, expiryDate: expiry, location: category === "Dairy" || category === "Meat & Fish" ? "Cold Storage" : pick(locations), notes: "" });
    });
    stockTx.sort((a, b) => a.date.localeCompare(b.date));
    stockTx.forEach((t, i) => { t.id = `STX-${pad(i + 1, 4)}`; });

    /* ---------- invoices & payments ---------- */
    const invoices = [];
    let invNo = 1000, payNo = 0;
    const methods = ["UPI", "UPI", "UPI", "Bank Transfer", "Cash", "Card"];
    const curMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthName = (d) => d.toLocaleString("en-US", { month: "short", year: "numeric" });
    for (let m = 9; m >= 0; m--) {
      const ms = new Date(curMonthStart.getFullYear(), curMonthStart.getMonth() - m, 1);
      const isCurrent = m === 0;
      residents.forEach((r) => {
        const monthEnd = iso(new Date(ms.getFullYear(), ms.getMonth() + 1, 0));
        if (r.joinDate > monthEnd || r.joinDate > T) return;
        if (r.checkOut && r.checkOut < iso(ms)) return;
        if (r.status === "Inactive" && m < 2) return;
        const itemsArr = [{ category: "Hostel Rent", description: `Room rent — ${monthName(ms)}`, amount: r.rent || 6000 }];
        const plan = planById[r.messPlan] || (r.status === "Checked Out" ? planById["MP-01"] : null);
        if (plan) itemsArr.push({ category: "Mess Fee", description: `${plan.name} — ${monthName(ms)}`, amount: plan.monthlyCharge });
        if (chance(0.15)) itemsArr.push({ category: "Laundry", description: "Laundry service", amount: 600 });
        const issue = r.joinDate > iso(ms) ? r.joinDate : iso(ms);
        const dueStd = iso(new Date(ms.getFullYear(), ms.getMonth(), settings.invoiceDueDay));
        const due = issue > dueStd ? iso(addDays(new Date(issue), 7)) : dueStd;
        const total = itemsArr.reduce((s, x) => s + x.amount, 0);
        const inv = {
          id: `INV-${++invNo}`, residentId: r.id, issueDate: issue, dueDate: due, period: monthName(ms),
          items: itemsArr, discount: chance(0.05) ? 500 : 0, taxRate: 0, lateFee: 0, notes: "", status: "Unpaid", payments: [], createdAt: issue,
        };
        const net = total - inv.discount;
        const roll = rand();
        const payDay = () => { const day = ri(2, 12); let d = new Date(ms.getFullYear(), ms.getMonth(), day); if (iso(d) < issue) d = addDays(new Date(issue), ri(0, 3)); return d > today ? T : iso(d); };
        const addPay = (amount, date) => inv.payments.push({ id: `PAY-${pad(++payNo, 5)}`, date, amount, method: pick(methods), reference: `TXN${ri(100000, 999999)}`, note: "" });
        if (!isCurrent) {
          if (roll < 0.93) addPay(net, payDay());
          else if (roll < 0.97) { addPay(Math.round(net * 0.5 / 100) * 100, payDay()); }
          else if (m < 3) { inv.lateFee = settings.lateFeeAmount; }
          else addPay(net, payDay());
        } else {
          const day = today.getDate();
          const pPaid = day >= 12 ? 0.74 : day >= 6 ? 0.5 : 0.25;
          if (roll < pPaid) addPay(net, payDay());
          else if (roll < pPaid + 0.12) addPay(Math.round(net * 0.5 / 100) * 100, payDay());
        }
        invoices.push(inv);
      });
    }
    // status computed and stored for convenience (common.js recomputes on every save)
    invoices.forEach((inv) => {
      const total = inv.items.reduce((s, x) => s + x.amount, 0) - inv.discount + inv.lateFee;
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      inv.status = paid >= total ? "Paid" : paid > 0 ? "Partial" : inv.dueDate < T ? "Overdue" : "Unpaid";
    });
    // Make the latest transactions appear "today"
    const curInvs = invoices.filter((i) => i.issueDate === iso(curMonthStart) && i.payments.length);
    curInvs.slice(-3).forEach((i) => { i.payments[i.payments.length - 1].date = T; });

    /* ---------- staff ---------- */
    const staffDefs = [
      ["Suresh Menon", "Male", "Warden", "BR-1", 32000, "General"], ["Rajesh Pillai", "Male", "Warden", "BR-2", 30000, "General"], ["Lakshmi Nair", "Female", "Warden", "BR-3", 30000, "General"],
      ["Joseph Mathew", "Male", "Assistant Warden", "BR-1", 22000, "Night"], ["Anitha Joseph", "Female", "Accountant", "BR-1", 28000, "General"],
      ["Biju Thomas", "Male", "Head Cook", "BR-1", 26000, "Morning"], ["Ramesh Kumar", "Male", "Cook", "BR-1", 18000, "Morning"], ["Sathyan P", "Male", "Cook", "BR-2", 18000, "Evening"],
      ["Mini Varghese", "Female", "Cook", "BR-3", 17500, "Morning"], ["Shibu K", "Male", "Kitchen Helper", "BR-1", 13000, "Morning"], ["Leela Das", "Female", "Kitchen Helper", "BR-1", 13000, "Evening"],
      ["Arun Babu", "Male", "Kitchen Helper", "BR-2", 12500, "Evening"], ["Manoj George", "Male", "Electrician", "BR-1", 21000, "General"], ["Siby Kurian", "Male", "Plumber", "BR-1", 20000, "General"],
      ["Sarala Mohan", "Female", "Housekeeping", "BR-1", 12000, "Morning"], ["Usha Chandran", "Female", "Housekeeping", "BR-3", 12000, "Morning"], ["Babu Raj", "Male", "Housekeeping", "BR-2", 12000, "Morning"],
      ["Gopal Krishnan", "Male", "Security Guard", "BR-1", 15000, "Night"], ["Vinod Kumar", "Male", "Security Guard", "BR-1", 15000, "Morning"], ["Thankappan N", "Male", "Security Guard", "BR-2", 14500, "Night"],
      ["Ambika Devi", "Female", "Security Guard", "BR-3", 14500, "Night"], ["Saji Sebastian", "Male", "Assistant Warden", "BR-2", 21000, "Evening"],
    ];
    const deptOf = Object.fromEntries(settings.designations.map((d) => [d.name, d.department]));
    const staff = staffDefs.map((s, i) => {
      const [name, gender, designation, branch, salary, shift] = s;
      return {
        id: `STF-${pad(i + 1, 3)}`, name, gender, phone: phone(), email: name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "") + "@hostelhub.demo",
        designation, department: deptOf[designation], branch, salary, shift, joinDate: daysAgo(ri(120, 1800)),
        status: i === 16 ? "On Leave" : "Active", address: `${pick(cities)}, Kerala`, notes: "", photo: "",
      };
    });
    staff.push({ id: "STF-023", name: "Prakash V", gender: "Male", phone: phone(), email: "prakash.v@hostelhub.demo", designation: "Cook", department: "Kitchen", branch: "BR-1", salary: 17000, shift: "Evening", joinDate: daysAgo(900), status: "Resigned", address: "Kottayam, Kerala", notes: "Resigned last quarter.", photo: "" });
    const activeStaff = staff.filter((s) => s.status !== "Resigned");
    const staffAttendance = [];
    for (let d = 13; d >= 0; d--) {
      const date = daysAgo(d);
      const marks = {};
      activeStaff.forEach((s) => { marks[s.id] = s.status === "On Leave" ? "L" : chance(0.92) ? "P" : chance(0.5) ? "A" : "L"; });
      staffAttendance.push({ id: `SA-${date.replace(/-/g, "")}`, date, marks });
    }
    const salaries = [];
    for (let m = 3; m >= 1; m--) {
      const ms = new Date(curMonthStart.getFullYear(), curMonthStart.getMonth() - m, 1);
      const month = `${ms.getFullYear()}-${pad(ms.getMonth() + 1)}`;
      activeStaff.forEach((s) => {
        const allow = Math.round(s.salary * 0.1 / 100) * 100;
        const ded = Math.round(s.salary * 0.05 / 100) * 100;
        salaries.push({ id: `SAL-${pad(salaries.length + 1, 4)}`, staffId: s.id, month, basic: s.salary, allowances: allow, deductions: ded, net: s.salary + allow - ded, status: "Paid", paidOn: iso(new Date(ms.getFullYear(), ms.getMonth() + 1, 1)) > T ? T : iso(new Date(ms.getFullYear(), ms.getMonth() + 1, 1)), method: "Bank Transfer" });
      });
    }
    const salaryTotal = activeStaff.reduce((s, x) => s + x.salary * 1.05, 0);

    /* ---------- expenses ---------- */
    const expenses = [];
    const addExp = (date, category, description, amount, vendor, method, status, branch = "BR-1") =>
      expenses.push({ id: "", date, category, description, amount: Math.round(amount), vendor, method, attachment: null, branch, status, approvedBy: status === "Approved" ? "Admin" : "", notes: "" });
    for (let m = 9; m >= 0; m--) {
      const ms = new Date(curMonthStart.getFullYear(), curMonthStart.getMonth() - m, 1);
      const daysIn = m === 0 ? today.getDate() : new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
      const dayDate = (day) => iso(new Date(ms.getFullYear(), ms.getMonth(), Math.min(day, daysIn)));
      const st = (day) => (m === 0 && day > daysIn - 4 ? "Pending" : "Approved");
      [2, 9, 16, 23].forEach((day, k) => { if (day <= daysIn) addExp(dayDate(day), "Food Purchase", ["Weekly grocery purchase", "Vegetables & dairy restock", "Rice and pulses bulk order", "Meat, fish and eggs"][k], ri(52000, 78000), pick(vendors.slice(0, 5)).name, pick(["Bank Transfer", "UPI"]), st(day), pick(["BR-1", "BR-1", "BR-2", "BR-3"])); });
      const payroll = iso(new Date(ms.getFullYear(), ms.getMonth(), daysIn));
      if (m > 0) addExp(payroll, "Staff Salary", `Staff salary — ${monthName(ms)}`, salaryTotal, "Payroll", "Bank Transfer", "Approved");
      if (5 <= daysIn) addExp(dayDate(5), "Utilities", "Electricity bill (KSEB)", ri(38000, 52000), "KSEB / Utilities", "Bank Transfer", st(5));
      if (7 <= daysIn) addExp(dayDate(7), "Utilities", "Water charges", ri(6000, 9000), "Kerala Water Authority", "UPI", st(7));
      if (8 <= daysIn) addExp(dayDate(8), "Utilities", "Internet & Wi-Fi", 8500, "Asianet Broadband", "UPI", st(8));
      if (11 <= daysIn) addExp(dayDate(11), "Maintenance", pick(["Plumbing repairs", "Electrical rewiring", "Painting & carpentry", "Water purifier service"]), ri(9000, 26000), "Local Contractor", "Cash", st(11), pick(["BR-1", "BR-2", "BR-3"]));
      if (19 <= daysIn) addExp(dayDate(19), "Maintenance", pick(["Generator servicing", "Lift AMC", "Fan & light replacement"]), ri(6000, 16000), "Metro Services", "Bank Transfer", st(19));
      if (14 <= daysIn) addExp(dayDate(14), "Others", pick(["Cleaning supplies", "Stationery & printing", "Pest control", "Gas cylinders"]), ri(8000, 22000), pick(["CleanPro Supplies", "Metro Kitchen Mart", "Office Mart"]), "UPI", st(14));
      if (25 <= daysIn) addExp(dayDate(25), "Others", pick(["Event & celebrations", "Laundry contract", "Security equipment"]), ri(7000, 18000), "Various", "Cash", st(25));
    }
    if (expenses.length) { const last = expenses.filter((e) => e.date >= iso(curMonthStart)); if (last.length) last[last.length - 1].status = "Pending"; }
    addExp(daysAgo(2), "Others", "New mattresses (quote)", 42000, "Sleepwell Dealer", "Bank Transfer", "Rejected");
    expenses.sort((a, b) => a.date.localeCompare(b.date));
    expenses.forEach((e, i) => { e.id = `EXP-${pad(i + 1, 4)}`; });

    /* ---------- maintenance ---------- */
    const mtTitles = [
      ["Tap leaking in bathroom", "Plumbing"], ["Ceiling fan not working", "Electrical"], ["Wardrobe door broken", "Carpentry"], ["Wi-Fi not reaching 3rd floor", "Internet"],
      ["Geyser not heating", "Appliance"], ["Tube light flickering", "Electrical"], ["Blocked drain in corridor", "Plumbing"], ["Window glass cracked", "Carpentry"],
      ["Water purifier service", "Appliance"], ["Ceiling leak after rain", "Civil"], ["Switch board sparking", "Electrical"], ["Bed frame loose", "Carpentry"],
      ["Washing machine not draining", "Appliance"], ["Mess hall exhaust fan noise", "Electrical"], ["Door lock jammed", "Carpentry"], ["Pest control required", "Cleaning"],
      ["Corridor lights fused", "Electrical"], ["Overhead tank cleaning", "Cleaning"], ["Toilet flush broken", "Plumbing"], ["Router replacement", "Internet"],
      ["Study table drawer stuck", "Carpentry"], ["Kitchen chimney cleaning", "Cleaning"], ["Water pressure low", "Plumbing"], ["AC not cooling", "Appliance"],
    ];
    const techs = { Plumbing: "STF-014", Electrical: "STF-013", Carpentry: "STF-013", Internet: "STF-013", Appliance: "STF-013", Civil: "STF-014", Cleaning: "STF-015" };
    const maintenance = mtTitles.map((t, i) => {
      const room = pick(rooms);
      const ago = Math.round((mtTitles.length - i) * 2.2) + ri(0, 2);
      const reported = daysAgo(ago);
      const status = ago > 20 ? (chance(0.7) ? "Closed" : "Resolved") : ago > 8 ? pick(["Resolved", "In Progress", "Closed", "On Hold"]) : pick(["Open", "In Progress", "Open"]);
      const priority = pick(["Low", "Medium", "Medium", "High", "Critical"]);
      const due = iso(addDays(new Date(reported), priority === "Critical" ? 1 : priority === "High" ? 3 : 7));
      const done = ["Resolved", "Closed"].includes(status);
      const est = ri(5, 40) * 100;
      const comments = [{ date: dt(reported, 9, 30), by: "Admin", text: "Ticket created from resident request." }];
      const worklog = [];
      if (status !== "Open") { comments.push({ date: dt(iso(addDays(new Date(reported), 1)), 11, 15), by: staff.find((s) => s.id === techs[t[1]]).name, text: "Inspected the issue. Parts required." }); worklog.push({ date: iso(addDays(new Date(reported), 1)), by: staff.find((s) => s.id === techs[t[1]]).name, hours: ri(1, 3), note: "Inspection and initial fix" }); }
      if (done) worklog.push({ date: iso(addDays(new Date(reported), 2)), by: staff.find((s) => s.id === techs[t[1]]).name, hours: ri(1, 4), note: "Completed repair and tested" });
      return {
        id: `MT-${pad(i + 1, 4)}`, title: t[0], category: t[1], branch: room.branch, roomId: room.id, priority,
        assignedTo: status === "Open" && chance(0.4) ? "" : techs[t[1]], reportedOn: reported, dueDate: due,
        completedOn: done ? iso(addDays(new Date(reported), 2)) : "", estCost: est, actualCost: done ? est + ri(-5, 8) * 100 : 0,
        status, notes: "", comments, worklog,
      };
    });

    /* ---------- visitors ---------- */
    const visitors = [];
    const purposes = ["Family visit", "Parent meeting", "Delivering items", "Friend visit", "Document submission", "Medical visit", "Guardian visit"];
    for (let i = 0; i < 64; i++) {
      const r = pick(activeResidents);
      const ago = Math.floor(i / 2.2);
      const date = daysAgo(30 - Math.min(30, ago));
      const inH = ri(9, 18), inM = pick([0, 10, 15, 20, 30, 40, 45]);
      const isToday = date === T;
      const stillIn = isToday && i % 3 === 0;
      const vName = `${pick(r.gender === "Female" ? femaleFirst.concat(maleFirst) : maleFirst)} ${r.name.split(" ")[1]}`;
      visitors.push({
        id: "", name: vName, phone: phone(), idProof: pick(["Aadhaar", "Driving Licence", "Voter ID", "Passport"]),
        residentId: r.id, purpose: pick(purposes), checkIn: dt(date, inH, inM),
        checkOut: stillIn ? "" : dt(date, Math.min(21, inH + ri(0, 2)), pick([5, 20, 35, 50])), branch: r.branch, notes: "",
      });
    }
    visitors.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    visitors.forEach((v, i) => { v.id = `VIS-${pad(i + 1, 4)}`; });

    /* ---------- complaints ---------- */
    const cmpDefs = [
      ["Food", "Food too spicy at dinner", "Dinner curries have been very spicy this week."], ["Cleanliness", "Bathroom not cleaned", "Common bathroom on 2nd floor was not cleaned for two days."],
      ["Internet", "Slow Wi-Fi in evenings", "Internet speed drops below 1 Mbps after 8 PM."], ["Room", "Window does not close", "Window latch is broken; rain water enters."],
      ["Noise", "Loud music late night", "Room next door plays music after 11 PM."], ["Food", "Breakfast served late", "Breakfast started at 8 AM instead of 7 AM."],
      ["Maintenance", "Fan making noise", "Ceiling fan is wobbling and noisy."], ["Staff", "Rude behaviour at gate", "Security staff was rude when I returned at 9 PM."],
      ["Cleanliness", "Garbage not collected", "Dustbin in corridor overflowing."], ["Food", "Request more veg options", "Please add more vegetarian dishes for lunch."],
      ["Room", "Bed bugs", "Bed bugs found in mattress — need pest control."], ["Internet", "Wi-Fi password not working", "Unable to connect after password change."],
      ["Maintenance", "No hot water", "Geyser on 1st floor not working."], ["Other", "Laundry clothes missing", "Two shirts missing from last laundry batch."],
      ["Food", "Drinking water taste", "Water from purifier tastes odd."], ["Noise", "Construction noise", "Renovation noise during exam week."],
      ["Cleanliness", "Mess hall tables sticky", "Tables are not wiped between batches."], ["Room", "Locker key lost", "Need duplicate locker key."],
      ["Staff", "Cook unavailable on Sunday", "Dinner was delayed due to staff absence."], ["Maintenance", "Leaking pipe under sink", "Water pooling below wash basin."],
      ["Internet", "LAN port dead", "Ethernet port in room not working."], ["Food", "Egg not provided", "Egg curry missing from Tuesday menu."],
      ["Other", "Parking space for bicycle", "Request covered parking for cycles."], ["Cleanliness", "Mosquito problem", "Need mosquito nets or fogging."],
      ["Room", "Curtain rod fell", "Curtain rod detached from wall."], ["Food", "Dinner portion size", "Chapathi count reduced to 3."],
    ];
    const complaints = cmpDefs.map((c, i) => {
      const r = pick(activeResidents);
      const ago = Math.round((cmpDefs.length - i) * 1.4);
      const created = daysAgo(ago);
      const status = ago > 15 ? pick(["Resolved", "Closed", "Resolved"]) : ago > 5 ? pick(["In Progress", "Resolved", "Open"]) : pick(["Open", "Open", "In Progress"]);
      const assignee = { Food: "STF-006", Cleanliness: "STF-015", Internet: "STF-013", Room: "STF-001", Noise: "STF-004", Maintenance: "STF-013", Staff: "STF-001", Other: "STF-001" }[c[0]];
      const history = [{ date: dt(created, 10, 5), status: "Open", note: "Complaint registered", by: r.name }];
      if (status !== "Open") history.push({ date: dt(iso(addDays(new Date(created), 1)), 12, 0), status: "In Progress", note: "Assigned and under review", by: "Admin" });
      if (["Resolved", "Closed"].includes(status)) history.push({ date: dt(iso(addDays(new Date(created), 3)), 16, 30), status, note: "Issue addressed and resident informed.", by: "Admin" });
      return {
        id: `CMP-${pad(i + 1, 4)}`, residentId: r.id, category: c[0], subject: c[1], description: c[2],
        priority: pick(["Low", "Medium", "Medium", "High"]), assignedTo: status === "Open" && chance(0.5) ? "" : assignee, status,
        createdAt: created, resolvedAt: ["Resolved", "Closed"].includes(status) ? iso(addDays(new Date(created), 3)) : "",
        resolution: ["Resolved", "Closed"].includes(status) ? "Issue addressed and resident informed." : "", history,
      };
    });

    /* ---------- notices ---------- */
    const noticeDefs = [
      ["Hostel fee due reminder", "Monthly hostel and mess fees are due on or before the 10th. A late fee applies after the due date.", "Fees", "Residents", "All", 2, 20, "Published", false],
      ["Water supply interruption", "Water supply will be interrupted on Saturday from 10 AM to 2 PM due to tank cleaning.", "Maintenance", "All", "BR-1", 1, 5, "Published", false],
      ["Onam celebration", "Join us for Onam Sadya and cultural programmes in the mess hall. Traditional dress encouraged!", "Event", "All", "All", 6, 14, "Published", true],
      ["New mess menu from Monday", "The revised weekly menu is now live. Share feedback with the mess manager.", "Mess", "Residents", "All", 4, 30, "Published", true],
      ["Gate timings revised", "Main gate closes at 10:00 PM. Late entry requires prior approval from the warden.", "Rules", "Residents", "All", 12, 90, "Published", true],
      ["Fire drill", "A mandatory fire drill will be conducted. Assemble at the front lawn when the alarm sounds.", "Emergency", "All", "BR-2", 0, 3, "Published", false],
      ["Staff meeting", "Monthly staff meeting in the admin office at 4 PM.", "General", "Staff", "All", 3, 6, "Published", true],
      ["Wi-Fi upgrade", "Internet upgrade to 300 Mbps fibre is scheduled next week.", "Maintenance", "All", "All", -3, 20, "Draft", false],
      ["Room inspection", "Wardens will conduct a routine room inspection this weekend.", "Rules", "Residents", "BR-3", 9, 12, "Unpublished", true],
      ["Independence Day programme", "Flag hoisting at 8 AM followed by breakfast.", "Event", "All", "All", 58, 60, "Archived", true],
    ];
    const notices = noticeDefs.map((n, i) => ({
      id: `NTC-${pad(i + 1, 3)}`, title: n[0], message: n[1], category: n[2], audience: n[3], branch: n[4],
      publishDate: daysAgo(n[5]), expiryDate: iso(addDays(new Date(daysAgo(n[5])), n[6])), status: n[7], read: n[8], createdAt: daysAgo(n[5] + 1),
    }));

    return {
      meta: { version: VERSION, seededOn: T, generator: "HostelHub demo-data.js" },
      settings, residents, rooms, messPlans, messSubscriptions, attendance, menus, vendors, inventory, stockTx,
      invoices, expenses, staff, staffAttendance, salaries, maintenance, visitors, complaints, notices,
    };
  }

  window.HH_DEMO = { VERSION, build };
})();
