# Quill native shells

These open the live desk at `https://ledger-futuret3ch.vercel.app/app`. They are not listed on the stores yet. You can run them now.

## iOS (Xcode first)

On a Mac:

```bash
open apps/ios/Quill.xcodeproj
```

Select an iPhone simulator, press Run. Set your Apple team under Signing if you want a device.

## Mac

```bash
open apps/macos/Quill.xcodeproj
```

Run on My Mac.

## Windows (Microsoft Store package)

```bash
cd apps/windows
npm install
npm start
```

That opens Quill on Windows. To build Store packages:

```bash
npm run pack
```

`appx` is the Microsoft Store package. Set `publisher` in `package.json` to your Partner Center identity before a store upload. `nsis` is a desktop installer you can run locally.
