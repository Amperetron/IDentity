/**
 * data.js - Seed Data for SIH26263 "APAAR-based Admission & Credential Platform"
 * Shared Contract: window.SEED = { colleges: [...], apaar: [...] }
 * 
 * Label: "Sandbox adapter"
 * Contains:
 * - 12 Colleges across 6 Indian states with intake capacities and NRI quotas.
 * - 60 Sandbox APAAR IDs (12-digit string) with realistic candidate demographic profiles.
 */

(function () {
  'use strict';

  const colleges = [
    // Maharashtra
    { id: "MH-COEP-01", name: "COEP Technological University, Pune", state: "Maharashtra", intake: 10, nriQuota: 2 },
    { id: "MH-VJTI-02", name: "Veermata Jijabai Technological Institute (VJTI), Mumbai", state: "Maharashtra", intake: 12, nriQuota: 2 },
    
    // Karnataka
    { id: "KA-RVCE-01", name: "RV College of Engineering (RVCE), Bengaluru", state: "Karnataka", intake: 10, nriQuota: 2 },
    { id: "KA-BMSC-02", name: "BMS College of Engineering, Bengaluru", state: "Karnataka", intake: 12, nriQuota: 2 },
    
    // Tamil Nadu
    { id: "TN-PSGC-01", name: "PSG College of Technology, Coimbatore", state: "Tamil Nadu", intake: 10, nriQuota: 2 },
    { id: "TN-TCEM-02", name: "Thiagarajar College of Engineering, Madurai", state: "Tamil Nadu", intake: 8, nriQuota: 1 },
    
    // Delhi
    { id: "DL-DTUD-01", name: "Delhi Technological University (DTU), New Delhi", state: "Delhi", intake: 12, nriQuota: 2 },
    { id: "DL-IGDT-02", name: "Indira Gandhi Delhi Technical University for Women, New Delhi", state: "Delhi", intake: 10, nriQuota: 2 },
    
    // Uttar Pradesh
    { id: "UP-HBTU-01", name: "Harcourt Butler Technical University (HBTU), Kanpur", state: "Uttar Pradesh", intake: 10, nriQuota: 2 },
    { id: "UP-IETL-02", name: "Institute of Engineering & Technology (IET), Lucknow", state: "Uttar Pradesh", intake: 10, nriQuota: 2 },
    
    // Telangana
    { id: "TS-CBIT-01", name: "Chaitanya Bharathi Institute of Technology (CBIT), Hyderabad", state: "Telangana", intake: 10, nriQuota: 2 },
    { id: "TS-VCEH-02", name: "Vasavi College of Engineering, Hyderabad", state: "Telangana", intake: 10, nriQuota: 2 }
  ];

  const candidateNames = [
    "Aarav Sharma", "Diya Patel", "Vihaan Rao", "Ananya Iyer", "Reyansh Kulkarni",
    "Ishaan Joshi", "Saanvi Nair", "Ayaan Mukherjee", "Myra Sen", "Kabir Deshmukh",
    "Aditi Menon", "Sai Reddy", "Tara Bhatia", "Rohan Verma", "Meera Nambiar",
    "Arjun Chauhan", "Rhea Pillai", "Devansh Mishra", "Prisha Gupta", "Krishna Nanda",
    "Anaya Hegde", "Aryan Kapoor", "Ira Trivedi", "Dhruv Banerjee", "Kavya Krishnan",
    "Atharv Bhosle", "Siddharth Reddy", "Zara Merchant", "Tanvi Deshmukh", "Shaurya Patil",
    "Avani Saxena", "Aditya Joshi", "Siya Singhania", "Samarth Malhotra", "Anvi Choudhary",
    "Manish Choudhary", "Navya Kaushik", "Vivaan Chopra", "Gauri Somani", "Yashwant Das",
    "Rohan Varma", "Shreya Shinde", "Madhav Venkatesh", "Pooja Hegde", "Nikhil Chawla",
    "Tanmay Agarwal", "Sneha Sunder", "Zoya Akhtar", "Varun Nair", "Nandini Rathi",
    "Karthik Subramanian", "Rahul Mehra", "Bhavya Swaminathan", "Harshavardhan Rao", "Divya Sundaram",
    "Chirag Sheth", "Alok Sengupta", "Deepika Shenoy", "Pranav Kadam", "Kritika Anand"
  ];

  const apaar = [];
  for (let i = 1; i <= 60; i++) {
    const idNum = String(i).padStart(4, '0');
    const apaarId = "98765432" + idNum; // 12-digit string
    const name = candidateNames[i - 1];
    const birthYear = 2004 + (i % 3);
    const birthMonth = String((i % 12) + 1).padStart(2, '0');
    const birthDay = String((i % 28) + 1).padStart(2, '0');
    const dob = `${birthYear}-${birthMonth}-${birthDay}`;
    apaar.push({ apaarId, name, dob });
  }

  // Export to window
  window.SEED = {
    colleges: colleges,
    apaar: apaar
  };

  // Helper lookup functions for convenience
  window.SEED.getCollege = function (id) {
    if (!id) return null;
    const cleanId = String(id).trim().toLowerCase();
    return colleges.find(c => c.id.toLowerCase() === cleanId) || null;
  };

  window.SEED.getStudent = function (apaarId) {
    if (!apaarId) return null;
    const cleanId = String(apaarId).trim();
    return apaar.find(s => s.apaarId === cleanId) || null;
  };
})();
