Polarity Boots sound slots
==========================

Place replacement sound effects in this folder using these exact names:

  positive.ogg
  negative.ogg

positive.ogg plays when the boots switch to positive polarity.
negative.ogg plays when the boots switch to negative polarity.

The files are optional. Atlas synthesizes a fallback cue while either file is
missing, empty, or undecodable.

After replacing a file during development, run:

  /sound reload

Packaged builds must be rebuilt so the new files are copied into dist.
