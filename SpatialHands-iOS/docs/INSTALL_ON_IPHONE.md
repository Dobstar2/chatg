# Install SpatialHands on an iPhone

GitHub stores the source code; it does not directly install an unsigned iOS app. The reliable native route is to sign the project with your Apple Account in Xcode and run it on a physical iPhone.

## What you need

- An iPhone on iOS 17 or later.
- A Mac with a current Xcode version that supports the iOS version on the phone.
- A USB cable, or wireless device deployment already configured in Xcode.
- An Apple Account signed into Xcode.

The intended 0.5x experience also requires an iPhone with a physical ultra-wide rear camera. SpatialHands automatically falls back to the normal rear camera when the ultra-wide camera is unavailable.

## First install

1. Download or clone the repository onto the Mac.
2. Open `SpatialHands.xcodeproj`.
3. Connect and unlock the iPhone. Choose **Trust** if the phone asks whether to trust the Mac.
4. In Xcode, click the blue **SpatialHands** project item, then select the **SpatialHands** target.
5. Open **Signing & Capabilities**.
6. Turn on **Automatically manage signing** and select your personal team.
7. Change the bundle identifier if Xcode says `com.dobstar.spatialhands` is unavailable. A good pattern is `com.<yourname>.spatialhands`.
8. Select the iPhone as the run destination in Xcode's toolbar.
9. Press **Run**.
10. Follow any prompt to enable Developer Mode, then restart the phone if iOS requests it.
11. Launch SpatialHands and allow camera access.

## Physical setup

The app deliberately uses the rear ultra-wide camera. The hand must therefore be in front of that lens rather than hidden behind the display.

- Put the iPhone on a stand with the rear cameras facing the hand-control area.
- Keep the whole hand visible and start around 40-120 cm from the phone.
- Point with the index fingertip.
- Pinch the thumb and index fingertip once to select a tile.
- Use the **Tracking** tile by touch to reverse horizontal movement or adjust cursor reach.

## Troubleshooting

### The app only says “Touch fallback”

Check camera permission in **Settings > Privacy & Security > Camera**. Also improve lighting and make sure the wrist, index fingertip, thumb fingertip, and center knuckle are all in frame.

### The cursor moves backward

Open **Tracking** and toggle **Mirror horizontal movement**.

### The cursor cannot reach the edges

Increase **Cursor reach** in **Tracking**. Move farther from the camera if the hand fills most of the frame.

### Xcode cannot create a provisioning profile

Make the bundle identifier unique and confirm an Apple Account is selected as the development team. Personal-team signing is intended for development/testing; TestFlight or App Store distribution needs the normal Apple Developer distribution workflow.

### The Simulator shows no usable tracking

Use a physical iPhone. A simulator cannot reproduce the requested rear-camera/hand geometry.
