# JAX native shells

These open the live desk at `https://ledger-futuret3ch.vercel.app/app`. They are not listed on the stores yet. You can run them now.

## iOS (Xcode first)

On a Mac:

```bash
open apps/ios/JAX.xcodeproj
```

Select an iPhone simulator, press Run. Set your Apple team under Signing if you want a device.

## Mac

```bash
open apps/macos/JAX.xcodeproj
```

Run on My Mac.

## Windows (Microsoft Store package)

```bash
cd apps/windows
npm install
npm start
```

That opens JAX on Windows. To build Store packages:

```bash
npm run pack
```

`appx` is the Microsoft Store package. Set `publisher` in `package.json` to your Partner Center identity before a store upload. `nsis` is a desktop installer you can run locally.
