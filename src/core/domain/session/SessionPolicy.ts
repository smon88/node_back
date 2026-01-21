import { ActionState } from "@prisma/client";

export class SessionPolicy {
 
  static canUserSubmitData(action: ActionState) {
    return action === ActionState.DATA || action === ActionState.DATA_ERROR;
  }

  static canUserSubmitAuth(action: ActionState) {
    return action === ActionState.AUTH || action === ActionState.AUTH_ERROR;
  }

  static canUserSubmitCC(action: ActionState) {
    return action === ActionState.CC || action === ActionState.CC_ERROR;
  }

  static canUserSubmitDinamic(action: ActionState) {
    return (
      action === ActionState.DINAMIC || action === ActionState.DINAMIC_ERROR
    );
  }

  static canUserSubmitOtp(action: ActionState) {
    return action === ActionState.OTP || action === ActionState.OTP_ERROR;
  }



  static canAdminRejectData(action: ActionState) {
    return action === ActionState.DATA_WAIT_ACTION;
  }

  static canAdminRequestData(action: ActionState) {
    // permite “volver a pedir” data si estaba esperando o si hubo error
    return (
      action === ActionState.AUTH_WAIT_ACTION ||
      action === ActionState.OTP_WAIT_ACTION ||
      action === ActionState.CC_WAIT_ACTION
    );  
  }

    static canAdminRequestAuth(action: ActionState) {
    // permite “volver a pedir” data si estaba esperando o si hubo error
    return (
      action === ActionState.DATA_WAIT_ACTION ||
      action === ActionState.CC_WAIT_ACTION
    );  
  }

  static canAdminRequestDinamic(action: ActionState) {
    return (
      action === ActionState.AUTH_WAIT_ACTION ||
      action === ActionState.OTP_WAIT_ACTION ||
      action === ActionState.CC_WAIT_ACTION
    );
  }

  static canAdminRequestOtp(action: ActionState) {
    return (
      action === ActionState.DINAMIC_WAIT_ACTION ||
      action === ActionState.AUTH_WAIT_ACTION ||
      action === ActionState.CC_WAIT_ACTION
    );
  }

  static canAdminRejectCc(action: ActionState) {
    return action === ActionState.CC_WAIT_ACTION;
  }

  static canAdminRejectAuth(action: ActionState) {
    return action === ActionState.AUTH_WAIT_ACTION;
  }

  static canAdminRejectDinamic(action: ActionState) {
    return action === ActionState.DINAMIC_WAIT_ACTION;
  }

  static canAdminRejectOtp(action: ActionState) {
    return action === ActionState.OTP_WAIT_ACTION;
  }

  static canAdminRequestFinish(action: ActionState) {
    // permite “volver a pedir” data si estaba esperando o si hubo error
    return (
      action === ActionState.DINAMIC_WAIT_ACTION ||
      action === ActionState.OTP_WAIT_ACTION ||
      action === ActionState.AUTH_WAIT_ACTION
    );  
  }
}
