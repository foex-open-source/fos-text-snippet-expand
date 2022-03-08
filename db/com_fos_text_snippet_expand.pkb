create or replace package body com_fos_text_snippet_expand
as

function render
  ( p_dynamic_action in apex_plugin.t_dynamic_action
  , p_plugin         in apex_plugin.t_plugin
  )
return apex_plugin.t_dynamic_action_render_result
as
    l_result           apex_plugin.t_dynamic_action_render_result;
    l_context          apex_exec.t_context;
    --
    l_idx_shortcut     pls_integer;
    l_idx_text         pls_integer;

    --attributes
    l_shortcut_query   p_dynamic_action.attribute_01%type :=
        case
            when p_dynamic_action.attribute_04 = 'CUSTOM'  then p_dynamic_action.attribute_01
            else                                                p_plugin.attribute_01
        end;
    l_stop_chars       p_dynamic_action.attribute_03%type :=
        case when p_dynamic_action.attribute_02 = 'CUSTOM' then p_dynamic_action.attribute_03
             else                                               p_plugin.attribute_03
        end;

begin
    --debug
    if apex_application.g_debug and substr(:DEBUG,6) >= 6
    then
        apex_plugin_util.debug_dynamic_action
          ( p_plugin         => p_plugin
          , p_dynamic_action => p_dynamic_action
          );
    end if;

    apex_json.initialize_clob_output;

    apex_json.open_object;

    apex_json.write('stopChars', l_stop_chars);
    -- this file will be loaded on demand if we apply the plugin to a CKE4 RTE
    apex_json.write('automatchPluginUrl', p_plugin.file_prefix || '/js/ckeditor-automatch-plugin.js');

    l_context := apex_exec.open_query_context(
        p_location          => apex_exec.c_location_local_db,
        p_sql_query         => l_shortcut_query );

    apex_json.open_object('dictionary');

    while apex_exec.next_row( l_context )
    loop
        apex_json.write(apex_exec.get_varchar2(l_context, 1), apex_exec.get_varchar2(l_context, 2));
    end loop;

    apex_exec.close( l_context );
    apex_json.close_object; -- dictionary

    apex_json.close_object; -- config object

    l_result.javascript_function := 'function(){FOS.utils.textSnippetExpand(this, ' ||  apex_json.get_clob_output || ');}';

    apex_json.free_output;

    return l_result;
end render;

end;
/


