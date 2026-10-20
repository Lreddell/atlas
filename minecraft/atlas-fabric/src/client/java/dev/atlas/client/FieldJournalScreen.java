package dev.atlas.client;

import dev.atlas.*;
import java.util.*;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

/** A quiet, optional field guide. No permanent quest overlay or compulsory markers. */
public final class FieldJournalScreen extends Screen {
  private int page;

  public FieldJournalScreen() {
    super(Text.literal("Atlas · Field Journal"));
  }

  @Override
  protected void init() {
    addDrawableChild(
        ButtonWidget.builder(
                Text.literal("Previous"),
                b -> {
                  page = Math.floorMod(page - 1, 4);
                })
            .dimensions(width / 2 - 155, height - 34, 95, 20)
            .build());
    addDrawableChild(
        ButtonWidget.builder(Text.literal("Close"), b -> close())
            .dimensions(width / 2 - 47, height - 34, 94, 20)
            .build());
    addDrawableChild(
        ButtonWidget.builder(
                Text.literal("Next"),
                b -> {
                  page = (page + 1) % 4;
                })
            .dimensions(width / 2 + 60, height - 34, 95, 20)
            .build());
  }

  @Override
  public boolean shouldPause() {
    return false;
  }

  @Override
  public void render(DrawContext ctx, int mx, int my, float delta) {
    super.render(ctx, mx, my, delta);
    int left = Math.max(12, width / 2 - 220), right = Math.min(width - 12, width / 2 + 220);
    ctx.fill(left - 8, 24, right + 8, height - 44, 0xee192327);
    ctx.fill(left - 8, 24, left - 6, height - 44, 0xffbba273);
    ctx.drawCenteredTextWithShadow(textRenderer, title, width / 2, 10, 0xe7d8b7);
    var p = client.player;
    if (p == null) return;
    var field = FieldMath.nearest(p.getBlockX(), p.getBlockZ(), AtlasClient.seed);
    String coords = field.x() + ", " + field.z();
    List<String> lines =
        switch (page) {
          case 0 ->
              List.of(
                  "01 · THE MAGNETIC FIELDS",
                  "Nearest field centre: " + coords,
                  "Six magnetite terraces rise around four axis towers. Iron gear responds to their"
                      + " fields. Gather the exposed crystals outside the arena and craft polarity"
                      + " boots before challenging the Warden.",
                  "C: dodge / magnetic dash. R: switch sign. V: enable boots. Same signs repel;"
                      + " opposite signs attract. Face an opposing wall and move forward to climb."
                      + " Sneak descends.",
                  "Outer terrain is open for building. The central arena unseals after victory. Use"
                      + " /atlas locate fields for coordinates in chat.");
          case 1 ->
              List.of(
                  "02 · THE WARDEN",
                  "Use the altar at the field centre to begin. A retreat or party wipe clears the"
                      + " encounter after ten seconds without a living survival player nearby.",
                  "Lit tower crystals protect a wedge toward the boss. Flank for full damage or"
                      + " break them with a pickaxe or returned bolt. All weapons can hurt the"
                      + " Warden. Watch the white lane and impact outlines; jump low shockwaves.",
                  "Opposing polarity and C can become a Magnet Slam when the crystals are down."
                      + " Space skips a cinematic; your chosen view returns afterward.",
                  "Victory opens the field for building and drops a polarity boots upgrade."
                      + " Sneak-use the altar for a rematch.");
          case 2 ->
              List.of(
                  "03 · THE RESONANT VAULT",
                  "Use /atlas locate vault. Find the Listening Spire above its centre; descend the"
                      + " spiral stair. Armory caches supply the tools for both exploration"
                      + " circuits.",
                  "The Memory Choir replays a six-note pattern. Counterweights build a crossing."
                      + " Acoustic Relays tune a circuit. Broken Crossings pulse on a visible"
                      + " rhythm.",
                  "Archives contain a Harmonic Lock: each of nine switches reverses itself and its"
                      + " neighbours. Silence all nine lights. Every starting pattern is solvable.",
                  "Clear both circuits to release the inner seal. Strike the Bell Titan's hanging"
                      + " bell during an opening for extra damage. After claiming the Sentinel"
                      + " Core, follow either ascent to the surface before the vault collapses.");
          default ->
              List.of(
                  "04 · FIELDCRAFT",
                  "Upgraded boots: G spends 40 stamina to project Warden Field for a brief pulse."
                      + " Positive repels nearby small enemies and returns Atlas bolts; negative"
                      + " draws them in. Eight-second recovery. Bosses and other players are"
                      + " unaffected.",
                  "Induction Relay: craft with copper, redstone, iron and both magnetite crystals."
                      + " Redstone power enables it. Use the block to choose + or −. It obeys the"
                      + " same field rules as natural magnets, including iron backing, dropped"
                      + " metal and polarity boots.",
                  "F5: free third person. F6: shoulder view. F7: fly camera / park camera / return."
                      + " O: music, camera, cinematics and reduced-motion options.",
                  "Minecraft Music, Hostile Creatures and Players sliders adjust the corresponding"
                      + " Atlas sounds. This journal stays optional; it does not pause multiplayer"
                      + " combat.");
        };
    int y = 37;
    for (int i = 0; i < lines.size(); i++) {
      for (var line : textRenderer.wrapLines(Text.literal(lines.get(i)), right - left)) {
        if (y < height - 52)
          ctx.drawTextWithShadow(textRenderer, line, left, y, i == 0 ? 0xe3c68b : 0xcad3d0);
        y += 11;
      }
      y += 9;
    }
  }
}
