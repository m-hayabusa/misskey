```sh
git clone https://github.com/m-hayabusa/misskey-emojis/
cd misskey-emojis
pnpm build
spnpm --filter @misskey-dev/emoji-assets pack
cp misskey-dev-emoji-assets-*.tgz ../
# 各package.jsonについて @misskey-dev/emoji-assets のファイルパスを書き替える
```
