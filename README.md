# PNG

## Reference

- https://oss-attachment.cn-hangzhou.oss.aliyun-inc.com/DC-008-Translation-2016-E.pdf
- https://ftp-osl.osuosl.org/pub/libpng/documents/pngext-1.5.0.html#C.eXIf
- https://f4.cosmoway.net/photo_exif/
- https://www.media.mit.edu/pia/Research/deepview/exif.html
- http://www2.airnet.ne.jp/~kenshi/exif.html#FORMAT
- https://www.hackerfactor.com/blog/index.php?/archives/895-Connecting-the-iDOTs.html
- https://qiita.com/kouheiszk/items/17485ccb902e8190923b
- https://darkcrowcorvus.hatenablog.jp/entry/2017/02/12/235044
- https://developer.mozilla.org/ja/docs/Web/API/Streams_API/Using_readable_streams
- https://github.com/mdn/dom-examples/tree/main/streams/png-transform-stream
- https://www.color.org/specification/ICC.1-2022-05.pdf

## 気づいたこと

- eXIf に撮影時のメタ情報などが含まれる
  - プライバシーのためにアップロードしたサービス側で削除していたりする
- スクショ時に macOS が独自に付与している iDOT というチャンクがある
  - ドキュメントがなくリバースエンジニアリングされている状態
  - パフォーマンス向上のためのヒントっぽい
- スクショ時に付与される情報に adobe の文字が
- Mac のスクショは全てフィルタが 1 (sub)

## 調べたい

- eXIf に具体的にどのようなメタ情報が含まれているのか
- 自社サービスでメタ情報を消しているか
- フィルタをかけないとどのくらいの圧縮率が悪くなるか
- インターレースどこで使われる？
- どのフィルタを選択するかをどうやって決める？
