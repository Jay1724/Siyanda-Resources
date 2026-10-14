#!/usr/bin/env python3
"""Downloads every image the site uses from the original Wix site into assets/img/.
Run once from this folder:   python3 download_images.py
Safe to re-run: files already downloaded are skipped."""
import os, sys, time, urllib.request

IMAGES = {
  "0fbd96_786b5c1bdcef483da71db012215fb19a_mv2.jpg": "https://static.wixstatic.com/media/0fbd96_786b5c1bdcef483da71db012215fb19a~mv2.jpg",
  "11062b_1c1dad37976a477086dea4fefabe1e09_mv2.jpg": "https://static.wixstatic.com/media/11062b_1c1dad37976a477086dea4fefabe1e09~mv2.jpg",
  "4ebd86b408624341912c9560e5c4cc87.jpg": "https://static.wixstatic.com/media/4ebd86b408624341912c9560e5c4cc87.jpg",
  "7e9495_03ec431c7e624f578b825e8f1ab1ad8a_mv2.jpg": "https://static.wixstatic.com/media/7e9495_03ec431c7e624f578b825e8f1ab1ad8a~mv2.jpg",
  "7e9495_06ed5a6292b74ee2b4356e23940e5415_mv2.jpg": "https://static.wixstatic.com/media/7e9495_06ed5a6292b74ee2b4356e23940e5415~mv2.jpg",
  "7e9495_06f98b3dca1b4fcf9a28e17e06fa682f_mv2.png": "https://static.wixstatic.com/media/7e9495_06f98b3dca1b4fcf9a28e17e06fa682f~mv2.png",
  "7e9495_0ca5018cdb1e49ff91aaac103d58d6ba_mv2.jpg": "https://static.wixstatic.com/media/7e9495_0ca5018cdb1e49ff91aaac103d58d6ba~mv2.jpg",
  "7e9495_11abb4f1044d4bdbb3d5344d6aceb313_mv2.jpg": "https://static.wixstatic.com/media/7e9495_11abb4f1044d4bdbb3d5344d6aceb313~mv2.jpg",
  "7e9495_14f2c121782449f0b1e8e6c71c6113c6_mv2.jpg": "https://static.wixstatic.com/media/7e9495_14f2c121782449f0b1e8e6c71c6113c6~mv2.jpg",
  "7e9495_1e1ad86978ce44ffbecdad73717516b4_mv2.jpg": "https://static.wixstatic.com/media/7e9495_1e1ad86978ce44ffbecdad73717516b4~mv2.jpg",
  "7e9495_25be8a832af64fb5abd95a30e1fe515c_mv2.png": "https://static.wixstatic.com/media/7e9495_25be8a832af64fb5abd95a30e1fe515c~mv2.png",
  "7e9495_27414e98722f43f788af11aebb73db04_mv2.jpg": "https://static.wixstatic.com/media/7e9495_27414e98722f43f788af11aebb73db04~mv2.jpg",
  "7e9495_2825397754a049a186c729a4e9b38218_mv2.jpg": "https://static.wixstatic.com/media/7e9495_2825397754a049a186c729a4e9b38218~mv2.jpg",
  "7e9495_3299b7d3e20445539056c820ae5fbd52_mv2.jpg": "https://static.wixstatic.com/media/7e9495_3299b7d3e20445539056c820ae5fbd52~mv2.jpg",
  "7e9495_33be6d0ff1b443ca9cbb81153d2384aa_mv2.webp": "https://static.wixstatic.com/media/7e9495_33be6d0ff1b443ca9cbb81153d2384aa~mv2.webp",
  "7e9495_3867c5b46e5c4e6bad0396c32b362001_mv2.png": "https://static.wixstatic.com/media/7e9495_3867c5b46e5c4e6bad0396c32b362001~mv2.png",
  "7e9495_387d8949fc394f94b457b8f2d28e4e29_mv2.jpg": "https://static.wixstatic.com/media/7e9495_387d8949fc394f94b457b8f2d28e4e29~mv2.jpg",
  "7e9495_390a91972389477487e62b2164713394_mv2.jpg": "https://static.wixstatic.com/media/7e9495_390a91972389477487e62b2164713394~mv2.jpg",
  "7e9495_43a66a2f963f44608561e4d133011c7c_mv2.jpeg": "https://static.wixstatic.com/media/7e9495_43a66a2f963f44608561e4d133011c7c~mv2.jpeg",
  "7e9495_44a1c4b663b24ed6928749ffbe5c6d1f_mv2.webp": "https://static.wixstatic.com/media/7e9495_44a1c4b663b24ed6928749ffbe5c6d1f~mv2.webp",
  "7e9495_47a6e682b51c46d2ba5e12706cd5f79b_mv2.jpg": "https://static.wixstatic.com/media/7e9495_47a6e682b51c46d2ba5e12706cd5f79b~mv2.jpg",
  "7e9495_48bae3a746444bad9eb813605f0e44f9_mv2.jpg": "https://static.wixstatic.com/media/7e9495_48bae3a746444bad9eb813605f0e44f9~mv2.jpg",
  "7e9495_50d3c0fb753b4e95b27cd00d6cedff74_mv2.jpg": "https://static.wixstatic.com/media/7e9495_50d3c0fb753b4e95b27cd00d6cedff74~mv2.jpg",
  "7e9495_5456a2bcef1b4680a1d163e01087e764_mv2.jpg": "https://static.wixstatic.com/media/7e9495_5456a2bcef1b4680a1d163e01087e764~mv2.jpg",
  "7e9495_55f211f747f74be78bb22eef647b8938_mv2.jpg": "https://static.wixstatic.com/media/7e9495_55f211f747f74be78bb22eef647b8938~mv2.jpg",
  "7e9495_5aea0ae0cfc843bbb346f9638a253faa_mv2.jpg": "https://static.wixstatic.com/media/7e9495_5aea0ae0cfc843bbb346f9638a253faa~mv2.jpg",
  "7e9495_5f17ff1443634b72bcaa0b6d0019befa_mv2.webp": "https://static.wixstatic.com/media/7e9495_5f17ff1443634b72bcaa0b6d0019befa~mv2.webp",
  "7e9495_618bac686a03451783462fc564f4b818_mv2.jpg": "https://static.wixstatic.com/media/7e9495_618bac686a03451783462fc564f4b818~mv2.jpg",
  "7e9495_632e6254a77d4a538dcc4f06c088e356_mv2.jpeg": "https://static.wixstatic.com/media/7e9495_632e6254a77d4a538dcc4f06c088e356~mv2.jpeg",
  "7e9495_662db88489214b7caa6a15d6a3b3aea8_mv2.jpg": "https://static.wixstatic.com/media/7e9495_662db88489214b7caa6a15d6a3b3aea8~mv2.jpg",
  "7e9495_66acd1ac991f43fcb78cd30d1bb22822_mv2.jpg": "https://static.wixstatic.com/media/7e9495_66acd1ac991f43fcb78cd30d1bb22822~mv2.jpg",
  "7e9495_687af20c293b447889724b504a54d766_mv2.jpg": "https://static.wixstatic.com/media/7e9495_687af20c293b447889724b504a54d766~mv2.jpg",
  "7e9495_68b63899aa7f4c86b3843f0cb249b64b_mv2.jpg": "https://static.wixstatic.com/media/7e9495_68b63899aa7f4c86b3843f0cb249b64b~mv2.jpg",
  "7e9495_6b7cbe0a878a460cb69c00bc4669bbfa_mv2.jpg": "https://static.wixstatic.com/media/7e9495_6b7cbe0a878a460cb69c00bc4669bbfa~mv2.jpg",
  "7e9495_7072ca94a7a0432590722d99275c95e2_mv2.jpg": "https://static.wixstatic.com/media/7e9495_7072ca94a7a0432590722d99275c95e2~mv2.jpg",
  "7e9495_70bedc5d00c440009ffaf58903c97c01_mv2.jpg": "https://static.wixstatic.com/media/7e9495_70bedc5d00c440009ffaf58903c97c01~mv2.jpg",
  "7e9495_7271fdb95f6e432784402e0b4b3d31ba_mv2.jpg": "https://static.wixstatic.com/media/7e9495_7271fdb95f6e432784402e0b4b3d31ba~mv2.jpg",
  "7e9495_75598ad43b904420a9733ae375b20ce8_mv2.jpg": "https://static.wixstatic.com/media/7e9495_75598ad43b904420a9733ae375b20ce8~mv2.jpg",
  "7e9495_7598e04b0cfd464ebb36d952255f3a09_mv2.jpg": "https://static.wixstatic.com/media/7e9495_7598e04b0cfd464ebb36d952255f3a09~mv2.jpg",
  "7e9495_76f2deafc8c249f2916213b1283a3d73_mv2.jpg": "https://static.wixstatic.com/media/7e9495_76f2deafc8c249f2916213b1283a3d73~mv2.jpg",
  "7e9495_82f0dd6202b54508b1cf75b51a2f035b_mv2.jpg": "https://static.wixstatic.com/media/7e9495_82f0dd6202b54508b1cf75b51a2f035b~mv2.jpg",
  "7e9495_835a3382bc764507a0e56973014b50b6_mv2.png": "https://static.wixstatic.com/media/7e9495_835a3382bc764507a0e56973014b50b6~mv2.png",
  "7e9495_922342764a054bb6a08d7164f9bb5987_mv2.webp": "https://static.wixstatic.com/media/7e9495_922342764a054bb6a08d7164f9bb5987~mv2.webp",
  "7e9495_959745cc9b574559a590337664734247_mv2.jpg": "https://static.wixstatic.com/media/7e9495_959745cc9b574559a590337664734247~mv2.jpg",
  "7e9495_acbc3f521e2245eabe03ce46d58bb966_mv2.jpg": "https://static.wixstatic.com/media/7e9495_acbc3f521e2245eabe03ce46d58bb966~mv2.jpg",
  "7e9495_b3d458c743894ce6a7db99df49210532_mv2.jpg": "https://static.wixstatic.com/media/7e9495_b3d458c743894ce6a7db99df49210532~mv2.jpg",
  "7e9495_b48d5a2920de4935b8cc16138dda0805_mv2.jpg": "https://static.wixstatic.com/media/7e9495_b48d5a2920de4935b8cc16138dda0805~mv2.jpg",
  "7e9495_b7d9d688c4964169b3e7b1d92a507ead_mv2.jpg": "https://static.wixstatic.com/media/7e9495_b7d9d688c4964169b3e7b1d92a507ead~mv2.jpg",
  "7e9495_bafe7a57b4a446dd8e835301d0a47481_mv2.jpg": "https://static.wixstatic.com/media/7e9495_bafe7a57b4a446dd8e835301d0a47481~mv2.jpg",
  "7e9495_c10d724ce3224372981ee773f9ab8689_mv2.jpg": "https://static.wixstatic.com/media/7e9495_c10d724ce3224372981ee773f9ab8689~mv2.jpg",
  "7e9495_c14030927c97471f972cba02203de5a8_mv2.png": "https://static.wixstatic.com/media/7e9495_c14030927c97471f972cba02203de5a8~mv2.png",
  "7e9495_c405dcde5e00468a8bb27f1f29f08019_mv2.jpg": "https://static.wixstatic.com/media/7e9495_c405dcde5e00468a8bb27f1f29f08019~mv2.jpg",
  "7e9495_d8d250df484f4a74b096caff5be55194_mv2.png": "https://static.wixstatic.com/media/7e9495_d8d250df484f4a74b096caff5be55194~mv2.png",
  "7e9495_dbe497dcdec14228bae74a4d992288ce_mv2.jpg": "https://static.wixstatic.com/media/7e9495_dbe497dcdec14228bae74a4d992288ce~mv2.jpg",
  "7e9495_dc30327c59b44e549cce92421d4af587_mv2.jpg": "https://static.wixstatic.com/media/7e9495_dc30327c59b44e549cce92421d4af587~mv2.jpg",
  "7e9495_dce791e7c366441a9ded72f6aca772e9_mv2.jpg": "https://static.wixstatic.com/media/7e9495_dce791e7c366441a9ded72f6aca772e9~mv2.jpg",
  "7e9495_e07629be3f164555b86fe34715fa46a0_mv2.jpg": "https://static.wixstatic.com/media/7e9495_e07629be3f164555b86fe34715fa46a0~mv2.jpg",
  "7e9495_e11718c351164a7990eb541901b6d50e_mv2.jpg": "https://static.wixstatic.com/media/7e9495_e11718c351164a7990eb541901b6d50e~mv2.jpg",
  "7e9495_e50ad978825247de930ad8fd93594352_mv2.jpg": "https://static.wixstatic.com/media/7e9495_e50ad978825247de930ad8fd93594352~mv2.jpg",
  "7e9495_ed75a126dd5d472094a231b25342f02e_mv2.jpg": "https://static.wixstatic.com/media/7e9495_ed75a126dd5d472094a231b25342f02e~mv2.jpg",
  "7e9495_f083ce184c6e4085ace0b57ae5140648_mv2.png": "https://static.wixstatic.com/media/7e9495_f083ce184c6e4085ace0b57ae5140648~mv2.png",
  "7e9495_f7ed066250c8475b884d283b323e4a9c_mv2.jpg": "https://static.wixstatic.com/media/7e9495_f7ed066250c8475b884d283b323e4a9c~mv2.jpg",
  "7e9495_fa5f58e16ca848ae847b6847aa4b02d5_mv2.png": "https://static.wixstatic.com/media/7e9495_fa5f58e16ca848ae847b6847aa4b02d5~mv2.png",
  "7e9495_fdc29d2f186f4842bf59cdd0a910945a_mv2.jpg": "https://static.wixstatic.com/media/7e9495_fdc29d2f186f4842bf59cdd0a910945a~mv2.jpg",
  "7e9495_fe47c50166f646e7b691003ee5946710_mv2.png": "https://static.wixstatic.com/media/7e9495_fe47c50166f646e7b691003ee5946710~mv2.png",
  "baac51_a1800801553a41e4b95e214079fef63e_mv2.jpg": "https://static.wixstatic.com/media/baac51_a1800801553a41e4b95e214079fef63e~mv2.jpg"
}

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "assets", "img")
os.makedirs(DEST, exist_ok=True)
ok = skipped = 0
failed = []
for name, url in IMAGES.items():
    path = os.path.join(DEST, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        skipped += 1
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
        ok += 1
        print("  ok  ", name)
    except Exception as e:
        failed.append((name, str(e)))
        print("  FAIL", name, e)
    time.sleep(0.15)
print("\nDownloaded %d, already present %d, failed %d (of %d)" % (ok, skipped, len(failed), len(IMAGES)))
if failed:
    print("Re-run to retry the failed ones.")
    sys.exit(1)
