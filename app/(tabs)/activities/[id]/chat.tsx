import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';

import { Text } from '@/components/Themed';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { useMessages, type MessageItem } from '@/lib/messages/useMessages';

// Chat de groupe d'une sortie. Accessible uniquement depuis l'écran détail
// (voir le bouton "Discussion", conditionné côté client sur les mêmes règles
// que la RLS de `messages` : participant confirmé ou propriétaire). Le titre
// de la sortie est passé en paramètre de navigation pour éviter une requête
// redondante ici.
export default function ActivityChatScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const router = useRouter();
  const { session } = useSession();

  const { messages, isLoading, error, realtimeStatus, sendMessage } = useMessages(
    id,
    session?.user.id
  );

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const isSendingRef = useRef(false);
  const listRef = useRef<FlatList<MessageItem>>(null);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !session || isSendingRef.current) return;

    isSendingRef.current = true;
    setIsSending(true);
    setSendError(null);

    // `sendMessage` insère puis ajoute le message à l'état local dès la
    // confirmation de l'insert : on ne dépend pas de l'écho Realtime pour
    // voir son propre message (le canal peut ne pas être encore
    // `SUBSCRIBED` juste après l'ouverture de l'écran).
    const ok = await sendMessage(body);

    isSendingRef.current = false;
    setIsSending(false);

    if (!ok) {
      setSendError("Le message n'a pas pu être envoyé. Réessayez.");
      return;
    }

    setDraft('');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <RNView style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            tintColor={colors.text}
            size={20}
          />
        </Pressable>
        <RNView style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title ?? 'Discussion'}
          </Text>
          {realtimeStatus === 'connecting' ? (
            <Text style={styles.headerStatus} numberOfLines={1}>
              Connexion…
            </Text>
          ) : realtimeStatus === 'error' ? (
            <Text style={styles.headerStatusError} numberOfLines={1}>
              Connexion en direct indisponible
            </Text>
          ) : null}
        </RNView>
        <RNView style={styles.headerSpacer} />
      </RNView>

      {isLoading ? (
        <RNView style={styles.centered}>
          <ActivityIndicator color={colors.lantern} />
        </RNView>
      ) : error ? (
        <RNView style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </RNView>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Aucun message pour l'instant. Lancez la discussion !
            </Text>
          }
          renderItem={({ item }) => {
            const isOwn = item.userId === session?.user.id;
            return (
              <RNView style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
                {!isOwn ? (
                  <RNView style={styles.avatar}>
                    <Text style={styles.avatarInitials}>
                      {item.authorName.trim().slice(0, 2).toUpperCase()}
                    </Text>
                  </RNView>
                ) : null}
                <RNView style={[styles.bubbleGroup, isOwn && styles.bubbleGroupOwn]}>
                  {!isOwn ? <Text style={styles.authorName}>{item.authorName}</Text> : null}
                  <RNView style={[styles.bubble, isOwn && styles.bubbleOwn]}>
                    <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                      {item.body}
                    </Text>
                  </RNView>
                </RNView>
              </RNView>
            );
          }}
        />
      )}

      {sendError ? <Text style={styles.sendErrorText}>{sendError}</Text> : null}

      <RNView style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Écrire au groupe…"
          placeholderTextColor={colors.textFaint}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (isSending || !draft.trim()) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={isSending || !draft.trim()}>
          {isSending ? (
            <ActivityIndicator color={colors.bg} size="small" />
          ) : (
            <SymbolView
              name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
              tintColor={colors.bg}
              size={18}
            />
          )}
        </Pressable>
      </RNView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  headerStatus: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerStatusError: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.ember,
    marginTop: 2,
  },
  headerSpacer: {
    width: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ember,
    textAlign: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.iris,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.bg,
  },
  bubbleGroup: {
    maxWidth: '75%',
  },
  bubbleGroupOwn: {
    alignItems: 'flex-end',
  },
  authorName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.xl,
    borderBottomLeftRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bubbleOwn: {
    backgroundColor: colors.lantern,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: 6,
  },
  bubbleText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  bubbleTextOwn: {
    fontFamily: fonts.bodyMedium,
    color: colors.bg,
  },
  sendErrorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.ember,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.lantern,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
