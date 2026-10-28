#!/usr/bin/env python3
"""Generate and validate reproducible synthetic AICTE admission demo data."""
import csv, json, random, re
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 2026
random.seed(SEED)
np.random.seed(SEED)
rng = np.random.default_rng(SEED)
OUT = Path("generated")
BATCH_DIR = OUT / "batches"
OUT.mkdir(exist_ok=True)
BATCH_DIR.mkdir(exist_ok=True)

# region-appropriate fictional name pools
NAME_POOLS = {
    "Gujarat": ("Aarav Avani Dhruv Hetal Jignesh Khushi Meet Nisha Parag Riya Sarthak Tanvi Vraj Zeel".split(), "Patel Shah Desai Mehta Trivedi Joshi Panchal Solanki Chauhan Vyas".split()),
    "Rajasthan": ("Aditya Ananya Arjun Bhavya Chirag Divya Gaurav Isha Kabir Meera Naman Pooja Rohan Sakshi Yash".split(), "Sharma Rathore Singh Jain Agarwal Choudhary Shekhawat Mathur Saxena Bansal".split()),
    "West Bengal": ("Abir Aishani Anirban Bipasha Debjani Gourav Ishani Kaushik Madhurima Neel Priyanka Rupam Shreya Sourav Tiyasha".split(), "Banerjee Chatterjee Das Dutta Ghosh Mukherjee Roy Sen Sengupta Bose".split()),
    "Kerala": ("Aditi Akash Anjali Arjun Devika Gautham Hari Kavya Meera Nandakumar Parvathy Rahul Sreeja Vishnu".split(), "Nair Menon Pillai Kurup Varma Nambiar Thomas Joseph Mathew".split()),
    "Andhra Pradesh": ("Achyut Anitha Bhargav Charita Deepak Harika Kiran Lakshmi Manoj Naveen Pallavi Ravi Sai Sravani Teja".split(), "Reddy Rao Naidu Chowdary Varma Sarma Prasad Gupta".split()),
    "Madhya Pradesh": ("Abhishek Akanksha Aman Anushka Devendra Garima Harsh Jyoti Karan Nidhi Pranav Ritu Shubham Swati Vivek".split(), "Tiwari Mishra Shukla Dubey Pandey Yadav Jain Soni Chaturvedi Rathore".split()),
    "Odisha": ("Abhipsa Ankit Barsha Bikash Debasish Ipsita Jyoti Manoj Namrata Pratyush Rakesh Sasmita Soumya Swagat".split(), "Mohanty Patnaik Dash Sahoo Pradhan Behera Jena Mishra Nayak Rout".split()),
    "Punjab": ("Amanpreet Arshdeep Gurpreet Harleen Jaspreet Karanveer Manpreet Navjot Prabhjot Rajveer Simran Sukhdeep".split(), "Singh Kaur Gill Grewal Sandhu Dhillon Bajwa Sidhu Mann Brar".split()),
    "Haryana": ("Aarav Bhavya Chhavi Deepanshu Himanshu Isha Jatin Kajal Mohit Nisha Pardeep Priya Rohit Sakshi Vikas".split(), "Yadav Singh Sharma Chauhan Rathi Malik Dahiya Hooda Ahlawat Tanwar".split()),
    "Bihar": ("Abhinav Anjali Ashish Babita Chandan Gauri Himanshu Khushboo Manish Nitish Pooja Ravi Shalini Sudhir Vikash".split(), "Kumar Singh Sharma Verma Gupta Yadav Jha Mishra Pandey Ranjan".split()),
    "Karnataka": ("Ananya Arjun Bhavana Chetan Deepa Ganesh Kavya Kiran Manasa Naveen Pooja Raghav Shruti Tejas Varsha".split(), "Hegde Rao Shetty Gowda Reddy Kamath Bhat Kulkarni Patil Desai".split()),
    "Maharashtra": ("Aarav Aditi Atharv Bhakti Chirag Gauri Ketaki Manish Nisha Omkar Pranav Rutuja Sameer Shreya Tanmay".split(), "Patil Deshmukh Joshi Kulkarni Shinde Pawar Jadhav More Bhosale Chavan".split()),
    "Tamil Nadu": ("Aarthi Arvind Deepak Gokul Janani Karthik Lakshmi Nandhini Priya Sanjay Sriram Vignesh".split(), "Iyer Subramanian Krishnan Raman Pillai Murthy".split()),
}
DEFAULT_STATE = "Maharashtra"

# (college id, fictional name, state, intake); final admitted/NRI targets follow
COLLEGE_DATA = [
    ("GJ-SIET-01", "Vatrak Institute of Engineering & Technology, Ahmedabad", "Gujarat", 12),
    ("GJ-NVIT-02", "Narmada Valley Institute of Technology, Vadodara", "Gujarat", 15),
    ("GJ-SCET-03", "Saurashtra Coastal Institute of Engineering, Rajkot", "Gujarat", 20),
    ("RJ-MRIT-01", "Marudhara Institute of Technology, Jodhpur", "Rajasthan", 15),
    ("RJ-SMIT-02", "Sawai Madhopur Institute of Engineering, Sawai Madhopur", "Rajasthan", 18),
    ("RJ-ARCE-03", "Aravali Ridge College of Engineering, Udaipur", "Rajasthan", 24),
    ("WB-ICET-01", "Ichhamati Institute of Engineering & Technology, Kolkata", "West Bengal", 24),
    ("WB-BCET-02", "Bishnupur College of Engineering & Technology, Durgapur", "West Bengal", 20),
    ("WB-GCET-03", "Gangetic Institute of Technology, Siliguri", "West Bengal", 18),
    ("KL-KITE-01", "Kadalundi Institute of Technology, Kozhikode", "Kerala", 20),
    ("KL-VIST-02", "Vembanad Institute of Science & Technology, Kochi", "Kerala", 18),
    ("KL-BCET-03", "Bharathapuzha College of Engineering, Thrissur", "Kerala", 15),
    ("AP-PIET-01", "Penna Institute of Engineering & Technology, Nellore", "Andhra Pradesh", 24),
    ("AP-SIET-02", "Srisailam Institute of Engineering, Kurnool", "Andhra Pradesh", 20),
    ("AP-PCET-03", "Pulicat College of Engineering, Tirupati", "Andhra Pradesh", 20),
    ("MP-OITG-01", "Orchha Institute of Technology, Gwalior", "Madhya Pradesh", 24),
    ("MP-RIES-02", "Rahatgarh Institute of Engineering, Sagar", "Madhya Pradesh", 18),
    ("OD-CITB-01", "Chilika Institute of Technology, Bhubaneswar", "Odisha", 20),
    ("OD-KCER-02", "Konark College of Engineering, Rourkela", "Odisha", 24),
    ("PB-BIET-01", "Beas Institute of Engineering & Technology, Amritsar", "Punjab", 18),
    ("PB-SCEL-02", "Sutlej College of Engineering, Ludhiana", "Punjab", 20),
    ("HR-SITG-01", "Sohna Institute of Technology, Gurugram", "Haryana", 24),
    ("HR-SIEK-02", "Saraswati Institute of Engineering, Kurukshetra", "Haryana", 36),
    ("BR-GIEP-01", "Ganga Institute of Engineering, Patna", "Bihar", 15),
    ("BR-KCEB-02", "Kosi College of Engineering, Bhagalpur", "Bihar", 18),
    ("KA-CITM-03", "Cauvery Institute of Technology, Mysuru", "Karnataka", 15),
    ("KA-NITM-04", "Netravati Institute of Technology, Mangaluru", "Karnataka", 20),
    ("MH-GITN-03", "Godavari Institute of Technology, Nashik", "Maharashtra", 18),
]
ADMITTED_TARGET = [12,15,18,15,18,9,23,16,8,19,15,5,22,14,7,18,6,13,11,5,8,20,0,3,4,13,4,15]
NRI_TARGET = [1,1,1,2,0,1,5,1,1,2,2,0,4,0,1,3,1,1,2,1,1,2,0,0,1,1,1,0]
# quotas produced by round(intake * U(0.08,0.20)) in this exact order
QUOTA_EXPECTED = [1,2,3,2,2,4,5,2,3,2,4,3,4,3,3,4,2,2,3,2,3,3,6,1,2,2,2,3]

cols = []
for cid, name, state, intake in COLLEGE_DATA:
    q = max(1, int(round(intake * float(rng.uniform(0.08, 0.20)))))
    cols.append({"id": cid, "name": name, "state": state, "intake": intake, "nriQuota": q})
assert [c["nriQuota"] for c in cols] == QUOTA_EXPECTED
CSTATE = {c["id"]: c["state"] for c in cols}
CQUOTA = {c["id"]: c["nriQuota"] for c in cols}
EXISTING = {"MH-COEP-01": (10, 2), "TN-TCEM-02": (8, 1)}
SEEDED = {f"98765432{i:04d}": "existing" for i in range(1, 41)}
SEEDED_NAMES = {
    "987654320001": "Aarav Sharma", "987654320002": "Diya Patel", "987654320003": "Vihaan Rao",
    "987654320004": "Ananya Iyer", "987654320005": "Reyansh Kulkarni", "987654320006": "Ishaan Joshi",
}

students, next_id = {}, 1
def make_name(state):
    first, last = NAME_POOLS.get(state, NAME_POOLS[DEFAULT_STATE])
    return f"{random.choice(first)} {random.choice(last)}"
def make_dob():
    return (date(2006, 1, 1) + timedelta(days=random.randrange(1096))).isoformat()
def new_student(state):
    global next_id
    aid = f"98765433{next_id:04d}"
    next_id += 1
    students[aid] = {"name": make_name(state), "dob": make_dob()}
    return aid

batches = {i: [] for i in range(1, 7)}
origins = {}
normal_ctr, nri_ctr, err_ctr = Counter(), Counter(), Counter()
DEPT = ["CS", "ME", "EC", "EE", "CE", "IT"]

def add_row(batch, cid, state=None, is_nri=False, aid=None, name=None, intended="admitted"):
    if aid is None:
        aid = new_student(state or CSTATE.get(cid, DEFAULT_STATE))
        name = students[aid]["name"]
    name = name or students.get(aid, {}).get("name") or make_name(state or CSTATE.get(cid, DEFAULT_STATE))
    code = cid.split("-")[1] if cid else "AICTE"
    if intended == "admitted":
        if is_nri:
            nri_ctr[cid] += 1
            roll = f"{code}-2026-NRI{nri_ctr[cid]:02d}"
        else:
            normal_ctr[cid] += 1
            roll = f"{code}-2026-{DEPT[(normal_ctr[cid]-1) % len(DEPT)]}{normal_ctr[cid]:02d}"
        origins[aid] = cid
    else:
        err_ctr[cid] += 1
        prefix = "BATCH" if intended == "seat_hoarding" else "ERR"
        roll = f"{code}-{prefix}-{err_ctr[cid]:02d}"
    batches[batch].append({
        "apaarId": aid, "name": name, "collegeId": cid,
        "isNRI": "true" if is_nri else "false", "rollNo": roll, "intended": intended,
    })

def add_plan(batch, plan):
    for cid, count, nri_count in plan:
        for i in range(count):
            add_row(batch, cid, is_nri=(i < nri_count))

# batch 1: opening day, 10 colleges / 5 states, all valid
add_plan(1, [("GJ-SIET-01",6,1), ("GJ-NVIT-02",7,1), ("GJ-SCET-03",7,0),
             ("RJ-MRIT-01",6,1), ("RJ-SMIT-02",8,0), ("WB-ICET-01",7,0),
             ("WB-BCET-02",8,0), ("KL-KITE-01",5,0), ("KL-VIST-02",4,1), ("AP-PIET-01",2,0)])

# batch 2: 66 valid + 2 unknown + empty collegeId + 11-digit APAAR
add_plan(2, [("WB-ICET-01",2,0), ("WB-BCET-02",2,0), ("WB-GCET-03",4,0),
             ("KL-KITE-01",3,0), ("KL-VIST-02",5,0), ("KL-BCET-03",3,0),
             ("AP-PIET-01",6,0), ("AP-SIET-02",6,0), ("AP-PCET-03",3,0),
             ("MP-OITG-01",7,0), ("MP-RIES-02",2,0), ("OD-CITB-01",4,0),
             ("OD-KCER-02",3,0), ("PB-BIET-01",3,0), ("PB-SCEL-02",3,0),
             ("HR-SITG-01",7,0), ("BR-GIEP-01",1,0), ("BR-KCEB-02",1,0), ("KA-CITM-03",1,0)])
add_row(2, "WB-ICET-01", is_nri=False, aid="987654339001", name="Rudra Sarkar", intended="unknown_apaar")
add_row(2, "KL-BCET-03", is_nri=False, aid="987654339002", name="Maya Thomas", intended="unknown_apaar")
empty_aid = new_student(random.choice(list(NAME_POOLS)))
add_row(2, "", is_nri=False, aid=empty_aid, name=students[empty_aid]["name"], intended="format_error")
add_row(2, "AP-SIET-02", is_nri=False, aid="98765433001", name="Tejas Varma", intended="format_error")

# batch 3: Gujarat/Rajasthan rush, 4 colleges hit 100%, 3 college_full rejects
add_plan(3, [("GJ-SIET-01",6,0), ("GJ-NVIT-02",8,0), ("GJ-SCET-03",11,1),
             ("RJ-MRIT-01",9,1), ("RJ-SMIT-02",10,0), ("RJ-ARCE-03",9,1)])
for cid in ("GJ-SIET-01", "GJ-NVIT-02", "RJ-MRIT-01"):
    add_row(3, cid, is_nri=False, intended="college_full")
add_plan(3, [("WB-ICET-01",5,0), ("WB-BCET-02",4,1), ("KL-KITE-01",3,0), ("AP-PIET-01",2,0)])

# batch 4: NRI-heavy at 3 colleges, fill their quotas, then 5 NRI rejects
add_plan(4, [("WB-ICET-01",9,5), ("KL-KITE-01",8,2), ("AP-PIET-01",9,4),
             ("WB-BCET-02",2,0), ("WB-GCET-03",3,0), ("KL-VIST-02",4,0),
             ("KL-BCET-03",2,0), ("AP-SIET-02",5,0), ("AP-PCET-03",3,0),
             ("MP-OITG-01",5,0), ("MP-RIES-02",2,0), ("OD-CITB-01",3,0)])
for cid in ("WB-ICET-01", "KL-KITE-01", "AP-PIET-01", "WB-ICET-01", "KL-KITE-01"):
    add_row(4, cid, is_nri=True, intended="nri_quota_exceeded")

# batch 5: 28 valid + 12 seat-hoarding rows
add_plan(5, [("WB-GCET-03",1,1), ("KL-VIST-02",2,1), ("AP-PIET-01",3,0),
             ("AP-SIET-02",3,0), ("AP-PCET-03",1,1), ("MP-OITG-01",6,3),
             ("MP-RIES-02",2,1), ("OD-CITB-01",4,1), ("OD-KCER-02",4,2), ("PB-BIET-01",2,1)])
hoard_targets = ["MH-GITN-03", "HR-SITG-01", "KA-NITM-04", "BR-KCEB-02", "KA-CITM-03", "PB-SCEL-02"]
earlier = [r["apaarId"] for b in range(1, 5) for r in batches[b] if r["intended"] == "admitted"]
for n, aid in enumerate(list(SEEDED)[:6] + random.sample(earlier, 6)):
    target = hoard_targets[n % len(hoard_targets)]
    if target == origins.get(aid):
        target = hoard_targets[(n + 1) % len(hoard_targets)]
    name = SEEDED_NAMES.get(aid, students.get(aid, {}).get("name", make_name(CSTATE[target])))
    add_row(5, target, is_nri=False, aid=aid, name=name, intended="seat_hoarding")

# batch 6: 60 valid spillover + 2 same-file duplicates + 3 existing-full attempts
b6_start = len(batches[6])
add_plan(6, [("OD-CITB-01",2,0), ("OD-KCER-02",4,0), ("PB-SCEL-02",5,1),
             ("HR-SITG-01",13,2), ("BR-GIEP-01",2,0), ("BR-KCEB-02",3,1),
             ("KA-CITM-03",12,1), ("KA-NITM-04",4,1), ("MH-GITN-03",15,0)])
b6_valid = batches[6][b6_start:]
for i, target in enumerate(("MH-GITN-03", "HR-SITG-01")):
    src = b6_valid[i]
    add_row(6, target, is_nri=False, aid=src["apaarId"], name=src["name"], intended="seat_hoarding")
for cid in ("MH-COEP-01", "MH-COEP-01", "TN-TCEM-02"):
    add_row(6, cid, state="Tamil Nadu" if cid.startswith("TN") else "Maharashtra",
            is_nri=False, intended="college_full")

# 480-entry registry. The six fixed batches can admit at most 391 students
# (6*70 rows minus rejects), so the 12% never-admitted target is arithmetically
# impossible here; the specified 480-person pool is retained.
while next_id <= 480:
    new_student(random.choice(list(NAME_POOLS)))

# ---------- engine simulation / validation ----------
registry = set(students) | {f"98765432{i:04d}" for i in range(1, 61)}
all_colleges = {c["id"]: c for c in cols}
for cid, (intake, q) in EXISTING.items():
    all_colleges[cid] = {"id": cid, "name": cid, "state": "existing", "intake": intake, "nriQuota": q}
active = dict(SEEDED)
counts = {c["id"]: {"admitted": 0, "nri": 0} for c in cols}
for cid, (intake, q) in EXISTING.items():
    counts[cid] = {"admitted": intake, "nri": q}

def check(row):
    vals = [row["apaarId"], row["name"], row["collegeId"], row["isNRI"], row["rollNo"]]
    if any(not str(v).strip() for v in vals) or not re.fullmatch(r"\d{12}", str(row["apaarId"]).strip()):
        return "format_error"
    aid, cid = row["apaarId"].strip(), row["collegeId"].strip()
    if aid not in registry:
        return "unknown_apaar"
    if aid in active:
        return "seat_hoarding"
    if cid not in all_colleges:
        return "format_error"
    if counts[cid]["admitted"] >= all_colleges[cid]["intake"]:
        return "college_full"
    if row["isNRI"] == "true" and counts[cid]["nri"] >= all_colleges[cid]["nriQuota"]:
        return "nri_quota_exceeded"
    counts[cid]["admitted"] += 1
    if row["isNRI"] == "true":
        counts[cid]["nri"] += 1
    active[aid] = cid
    return "admitted"

all_rows, admitted_ids = [], []
for b in range(1, 7):
    for i, row in enumerate(batches[b], 1):
        row["outcome"], row["batch"], row["row"] = check(row), b, i
        all_rows.append(row)
        if row["outcome"] == "admitted":
            admitted_ids.append(row["apaarId"])

assert all(r["outcome"] == r["intended"] for r in all_rows), "rule-engine mismatch"
assert len(admitted_ids) == len(set(admitted_ids)), "duplicate admission"
assert len(students) == len(set(students)) == 480, "registry IDs not unique"
assert all(counts[c["id"]]["admitted"] <= c["intake"] for c in cols), "intake overflow"
assert all(counts[c["id"]]["nri"] <= c["nriQuota"] for c in cols), "NRI overflow"
assert all(len(batches[b]) <= 70 for b in range(1, 7)), "batch over 70 rows"
assert all(r["collegeId"] != origins[r["apaarId"]] for r in batches[5]
           if r["intended"] == "seat_hoarding" and r["apaarId"] in origins), "hoarder reused same college"
assert [counts[c["id"]]["admitted"] for c in cols] == ADMITTED_TARGET
assert [counts[c["id"]]["nri"] for c in cols] == NRI_TARGET
utils = [100 * counts[c["id"]]["admitted"] / c["intake"] for c in cols]
buckets = {"100%": sum(u == 100 for u in utils), "90-99%": sum(90 <= u < 100 for u in utils),
           "60-89%": sum(60 <= u < 90 for u in utils), "25-59%": sum(25 <= u < 60 for u in utils),
           "<25%": sum(u < 25 for u in utils)}
assert buckets == {"100%": 4, "90-99%": 4, "60-89%": 8, "25-59%": 8, "<25%": 4}
assert sum(u == 0 for u in utils) == 1
assert sum(x == CQUOTA[c["id"]] for x, c in zip(NRI_TARGET, cols)) == 5
assert sum(x == 0 for x in NRI_TARGET) == 6
state_avg = pd.DataFrame({"state": [c["state"] for c in cols], "u": utils}).groupby("state").u.mean()
assert state_avg["Gujarat"] == state_avg.max() and state_avg["Bihar"] == state_avg.min()
assert 0.08 <= sum(NRI_TARGET) / sum(ADMITTED_TARGET) <= 0.12

# ---------- write outputs ----------
def wcsv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)

HEADER = ["apaarId", "name", "collegeId", "isNRI", "rollNo"]
for b in range(1, 7):
    wcsv(BATCH_DIR / f"batch_{b}.csv", HEADER,
         [[r["apaarId"], r["name"], r["collegeId"], r["isNRI"], r["rollNo"]] for r in batches[b]])
    assert open(BATCH_DIR / f"batch_{b}.csv", encoding="utf-8").readline().strip() == ",".join(HEADER)

exp_rows = [[r["batch"], r["row"], r["apaarId"], r["collegeId"], r["outcome"]] for r in all_rows]
wcsv(OUT / "EXPECTED.csv", ["batch", "row", "apaarId", "collegeId", "expected_outcome"], exp_rows)

state_rows = []
for c in cols:
    st = counts[c["id"]]
    state_rows.append([c["id"], c["name"], c["state"], c["intake"], st["admitted"],
                       c["nriQuota"], st["nri"], f"{100*st['admitted']/c['intake']:.1f}"])
wcsv(OUT / "EXPECTED_STATE.csv",
     ["collegeId", "name", "state", "intake", "admitted", "nriQuota", "nriAdmitted", "utilization_pct"],
     state_rows)

with open(OUT / "data_extra.js", "w", encoding="utf-8") as f:
    f.write("(function(){ var S = window.SEED;\n")
    for c in cols:
        f.write('  S.colleges.push({id:%s, name:%s, state:%s, intake:%d, nriQuota:%d});\n' %
                (json.dumps(c["id"]), json.dumps(c["name"]), json.dumps(c["state"]),
                 c["intake"], c["nriQuota"]))
    for aid in sorted(students):
        s = students[aid]
        f.write('  S.apaar.push({apaarId:%s, name:%s, dob:%s});\n' %
                (json.dumps(aid), json.dumps(s["name"]), json.dumps(s["dob"])))
    f.write("})();\n")

VERIFY_SRC = '''#!/usr/bin/env python3
"""Answer 15 ground-truth questions from a dashboard CSV export."""
import sys
import pandas as pd

path = sys.argv[1] if len(sys.argv) > 1 else "export.csv"
df = pd.read_csv(path)
df.columns = [c.strip() for c in df.columns]
df["Total Intake"] = df["Total Intake"].astype(int)
df["Admitted"] = df["Admitted"].astype(int)
df["Utilization"] = df["Utilization"].astype(str).str.replace("%", "", regex=False).astype(float)
nri = df["NRI Admitted"].astype(str).str.split("/", expand=True)
df["NRI Admitted"] = nri[0].astype(int)
df["NRI Quota"] = nri[1].astype(int)
df["Vacant"] = df["Total Intake"] - df["Admitted"]

def show(title, frame):
    print("\\n" + title)
    print("(no matching colleges)" if len(frame) == 0 else frame.to_string(index=False))

def table(frame, cols):
    return frame[cols].sort_values(cols[-1], ascending=False)

show("1. Colleges in Karnataka above 80% utilization",
     df[(df.State == "Karnataka") & (df.Utilization > 80)][["College ID", "Institution", "State", "Utilization"]])
show("2. Colleges below 40% utilization",
     df[df.Utilization < 40][["College ID", "Institution", "State", "Utilization"]])
show("3. Colleges with all NRI seats used",
     df[(df["NRI Quota"] > 0) & (df["NRI Admitted"] >= df["NRI Quota"])][["College ID", "Institution", "State", "NRI Admitted", "NRI Quota"]])
show("4. Colleges with no NRI admissions",
     df[df["NRI Admitted"] == 0][["College ID", "Institution", "State", "NRI Admitted", "NRI Quota"]])
show("5. Top 5 colleges by admitted students",
     df.nlargest(5, "Admitted")[["College ID", "Institution", "State", "Admitted"]])
show("6. Least utilized college",
     df.nsmallest(1, "Utilization")[["College ID", "Institution", "State", "Utilization", "Admitted"]])
show("7. Colleges in Gujarat",
     df[df.State == "Gujarat"][["College ID", "Institution", "State", "Admitted", "Utilization"]])
show("8. Colleges at 100% capacity",
     df[df.Admitted >= df["Total Intake"]][["College ID", "Institution", "State", "Admitted", "Total Intake", "Utilization"]])
show("9. Colleges with intake above 30",
     df[df["Total Intake"] > 30][["College ID", "Institution", "State", "Total Intake", "Admitted"]])
show("10. Colleges in Maharashtra with unused NRI seats",
     df[(df.State == "Maharashtra") & (df["NRI Admitted"] < df["NRI Quota"])][["College ID", "Institution", "State", "NRI Admitted", "NRI Quota"]])
avg = df.groupby("State", as_index=False)["Utilization"].mean().sort_values("Utilization", ascending=False)
avg["Utilization"] = avg["Utilization"].round(1)
show("11. Average utilization per state, highest first", avg)
cnt = df.groupby("State").size().reset_index(name="Colleges").sort_values(["Colleges", "State"], ascending=[False, True])
show("12. Number of colleges per state", cnt)
show("13. Colleges whose name contains \\"Institute\\"",
     df[df.Institution.str.contains("Institute", case=False, na=False)][["College ID", "Institution", "State"]])
show("14. Colleges with more than 5 vacant seats",
     df[df.Vacant > 5][["College ID", "Institution", "State", "Total Intake", "Admitted", "Vacant"]])
print("\\n15. Total admitted students across all colleges")
print(int(df.Admitted.sum()))
'''
(OUT / "verify_queries.py").write_text(VERIFY_SRC, encoding="utf-8")

# ---------- summary ----------
print("rows per batch:", ", ".join(f"batch_{b}={len(batches[b])}" for b in range(1, 7)))
for b in range(1, 7):
    reasons = Counter(r["outcome"] for r in batches[b] if r["outcome"] != "admitted")
    print(f"batch_{b}: admitted={sum(r['outcome'] == 'admitted' for r in batches[b])}, "
          f"rejected={sum(r['outcome'] != 'admitted' for r in batches[b])}, reasons={dict(reasons)}")
print("utilization buckets:", buckets)
print(f"registry={len(students)}, admitted_students={len(admitted_ids)}, "
      f"nri_admitted={sum(NRI_TARGET)}")
