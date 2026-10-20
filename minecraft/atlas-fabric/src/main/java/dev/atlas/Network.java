package dev.atlas;

import net.fabricmc.fabric.api.networking.v1.*;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.network.ServerPlayerEntity;

public final class Network {
  public record Attack(int entity, float yaw, float pitch) implements CustomPayload {
    public static final Id<Attack> ID = new Id<>(Atlas.id("attack"));
    public static final PacketCodec<RegistryByteBuf, Attack> CODEC =
        new PacketCodec<>() {
          public Attack decode(RegistryByteBuf b) {
            return new Attack(b.readVarInt(), b.readFloat(), b.readFloat());
          }

          public void encode(RegistryByteBuf b, Attack p) {
            b.writeVarInt(p.entity);
            b.writeFloat(p.yaw);
            b.writeFloat(p.pitch);
          }
        };

    public Id<? extends CustomPayload> getId() {
      return ID;
    }
  }

  public record Control(int action, float yaw, float forward, float sideways)
      implements CustomPayload {
    public static final Id<Control> ID = new Id<>(Atlas.id("control"));
    public static final PacketCodec<RegistryByteBuf, Control> CODEC =
        new PacketCodec<>() {
          public Control decode(RegistryByteBuf b) {
            return new Control(b.readVarInt(), b.readFloat(), b.readFloat(), b.readFloat());
          }

          public void encode(RegistryByteBuf b, Control p) {
            b.writeVarInt(p.action);
            b.writeFloat(p.yaw);
            b.writeFloat(p.forward);
            b.writeFloat(p.sideways);
          }
        };

    public Id<? extends CustomPayload> getId() {
      return ID;
    }
  }

  public record State(
      int stamina, int roll, int polarity, long seed, boolean bloodMoon, String context)
      implements CustomPayload {
    public static final Id<State> ID = new Id<>(Atlas.id("state"));
    public static final PacketCodec<RegistryByteBuf, State> CODEC =
        new PacketCodec<>() {
          public State decode(RegistryByteBuf b) {
            return new State(
                b.readVarInt(),
                b.readVarInt(),
                b.readInt(),
                b.readLong(),
                b.readBoolean(),
                b.readString(64));
          }

          public void encode(RegistryByteBuf b, State p) {
            b.writeVarInt(p.stamina);
            b.writeVarInt(p.roll);
            b.writeInt(p.polarity);
            b.writeLong(p.seed);
            b.writeBoolean(p.bloodMoon);
            b.writeString(p.context, 64);
          }
        };

    public Id<? extends CustomPayload> getId() {
      return ID;
    }
  }

  public record Cue(String cue, int entity, String kind) implements CustomPayload {
    public static final Id<Cue> ID = new Id<>(Atlas.id("cue"));
    public static final PacketCodec<RegistryByteBuf, Cue> CODEC =
        new PacketCodec<>() {
          public Cue decode(RegistryByteBuf b) {
            return new Cue(b.readString(32), b.readVarInt(), b.readString(64));
          }

          public void encode(RegistryByteBuf b, Cue p) {
            b.writeString(p.cue, 32);
            b.writeVarInt(p.entity);
            b.writeString(p.kind, 64);
          }
        };

    public Id<? extends CustomPayload> getId() {
      return ID;
    }
  }

  public static void init() {
    PayloadTypeRegistry.playC2S().register(Attack.ID, Attack.CODEC);
    ServerPlayNetworking.registerGlobalReceiver(
        Attack.ID, (p, c) -> c.server().execute(() -> Combat.request(c.player(), p)));
    PayloadTypeRegistry.playC2S().register(Control.ID, Control.CODEC);
    PayloadTypeRegistry.playS2C().register(State.ID, State.CODEC);
    PayloadTypeRegistry.playS2C().register(Cue.ID, Cue.CODEC);
    ServerPlayNetworking.registerGlobalReceiver(
        Control.ID,
        (packet, context) ->
            context
                .server()
                .execute(
                    () -> {
                      if (Float.isFinite(packet.yaw)
                          && Float.isFinite(packet.forward)
                          && Float.isFinite(packet.sideways))
                        PlayerMechanics.control(context.player(), packet);
                    }));
  }

  public static void sendCue(ServerPlayerEntity p, String cue, int entity, String kind) {
    ServerPlayNetworking.send(p, new Cue(cue, entity, kind));
  }
}
