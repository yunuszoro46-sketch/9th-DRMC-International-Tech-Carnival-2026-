import cv2, sys
n = int(sys.argv[1]); ok = 0
for i in range(n):
    img = cv2.imread(f'/tmp/qr_{i}.pgm', 0); want = open(f'/tmp/qr_{i}.txt', encoding='utf8').read()
    got, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    print('OK  ' if got == want else 'FAIL', len(want), repr(got[:40])); ok += got == want
sys.exit(0 if ok == n else 1)
